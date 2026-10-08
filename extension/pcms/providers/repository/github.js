import {
 REPO_ERRORS,REPOSITORY_MAX_TREE_ENTRIES,assertBlobInput,normalizeRepoCommitId,
 normalizeRepoTree,normalizeRepositoryConfig,repositoryFailure,repositoryPath
} from "./contract.js";

const API="https://api.github.com";
const MAX_JSON_BYTES=12*1024*1024;
function errorFromStatus(status,headers){
  if(status===401||status===403&&headers.get("x-ratelimit-remaining")!=="0")return repositoryFailure(REPO_ERRORS.AUTH_FAILED);
  if(status===404)return repositoryFailure(REPO_ERRORS.NOT_FOUND);
  if(status===429||status===403&&headers.get("x-ratelimit-remaining")==="0"){
    const retry=Number(headers.get("retry-after"));const reset=Number(headers.get("x-ratelimit-reset"));
    const resetAt=Number.isFinite(reset)&&reset>0?new Date(reset*1000).toISOString()
      :Number.isFinite(retry)&&retry>=0?new Date(Date.now()+retry*1000).toISOString():null;
    return repositoryFailure(REPO_ERRORS.RATE_LIMITED,resetAt);
  }
  return repositoryFailure(status>=500?REPO_ERRORS.UNAVAILABLE:REPO_ERRORS.PROTOCOL);
}
function decode64(base64,maxBytes){
  if(typeof base64!=="string"||base64.length>Math.ceil(maxBytes/3)*4+16||!/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(base64))
    throw repositoryFailure(REPO_ERRORS.PROTOCOL);
  const cleaned=base64.replace(/[\r\n]/g,"");
  let binary;
  try{binary=atob(cleaned);}catch{throw repositoryFailure(REPO_ERRORS.PROTOCOL);}
  if(binary.length>maxBytes)throw repositoryFailure(REPO_ERRORS.TOO_LARGE);
  return Uint8Array.from(binary,ch=>ch.charCodeAt(0));
}
export function createGithubRepositoryProvider({fetchImpl=globalThis.fetch,secretResolver=null}={}){
  if(typeof fetchImpl!=="function")throw new TypeError("A background fetch implementation is required");
  if(secretResolver!==null&&typeof secretResolver!=="function")throw new TypeError("Secret resolver must be a function");

  async function get(config,path){
    const c=normalizeRepositoryConfig(config);
    let token=null;
    if(c.access.kind==="token"){
      if(!secretResolver)throw repositoryFailure(REPO_ERRORS.AUTH_FAILED);
      try{token=await secretResolver(c.access.secretRef);}catch{throw repositoryFailure(REPO_ERRORS.AUTH_FAILED);}
      if(typeof token!=="string"||!token||/[\r\n]/.test(token))throw repositoryFailure(REPO_ERRORS.AUTH_FAILED);
    }
    const headers={"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
    if(token!==null)headers.Authorization="Bearer "+token;
    const controller=new AbortController();
    let response;
    try{response=await fetchImpl(API+"/repos/"+encodeURIComponent(c.owner)+"/"+encodeURIComponent(c.repo)+"/"+path,{
      method:"GET",headers,redirect:"error",signal:controller.signal,credentials:"omit",cache:"no-store"
    });}catch{throw repositoryFailure(REPO_ERRORS.UNAVAILABLE);}
    if(!response||typeof response.status!=="number"||!response.headers||typeof response.headers.get!=="function")
      throw repositoryFailure(REPO_ERRORS.PROTOCOL);
    if(!response.ok)throw errorFromStatus(response.status,response.headers);
    if(Number(response.headers.get("content-length"))>MAX_JSON_BYTES)throw repositoryFailure(REPO_ERRORS.TOO_LARGE);
    let raw;
    try{raw=await response.text();}catch{throw repositoryFailure(REPO_ERRORS.UNAVAILABLE);}
    if(new TextEncoder().encode(raw).byteLength>MAX_JSON_BYTES)throw repositoryFailure(REPO_ERRORS.TOO_LARGE);
    try{return JSON.parse(raw);}catch{throw repositoryFailure(REPO_ERRORS.PROTOCOL);}
  }
  const describe=config=>{
    const c=normalizeRepositoryConfig(config);
    return Object.freeze({kind:"github",label:"github · "+c.owner+"/"+c.repo+"@"+c.ref,
      webUrl:(path,commitId)=>"https://github.com/"+encodeURIComponent(c.owner)+"/"+encodeURIComponent(c.repo)+"/blob/"+normalizeRepoCommitId(commitId)+"/"+repositoryPath(c,path).split("/").map(encodeURIComponent).join("/")});
  };
  async function resolveRef(config){
    const c=normalizeRepositoryConfig(config);
    const raw=await get(c,"commits/"+c.ref.split("/").map(encodeURIComponent).join("%2F"));
    const commitId=normalizeRepoCommitId(raw?.sha);
    const at=raw?.commit?.committer?.date;
    if(typeof at!=="string"||!Number.isFinite(Date.parse(at)))throw repositoryFailure(REPO_ERRORS.PROTOCOL);
    return Object.freeze({commitId,committedAt:new Date(at).toISOString(),message:String(raw?.commit?.message??"").slice(0,200)});
  }
  async function listTree(config,commitId){
    const sha=normalizeRepoCommitId(commitId);
    const raw=await get(config,"git/trees/"+sha+"?recursive=1");
    if(raw?.truncated===true)throw repositoryFailure(REPO_ERRORS.TREE_TRUNCATED);
    if(raw?.truncated!==false||!Array.isArray(raw.tree)||raw.tree.length>REPOSITORY_MAX_TREE_ENTRIES)
      throw repositoryFailure(REPO_ERRORS.PROTOCOL);
    return normalizeRepoTree({complete:true,entries:raw.tree.map(item=>({
      path:item.path,type:item.type==="blob"?"file":item.type==="tree"?"dir":"invalid",
      size:item.type==="blob"?item.size:0,blobId:item.type==="blob"?item.sha:null
    }))});
  }
  async function readBlob(config,commitId,path,blobId,{maxBytes}={}){
    normalizeRepoCommitId(commitId);
    assertBlobInput(path,blobId,maxBytes);
    const raw=await get(config,"git/blobs/"+blobId);
    if(raw?.encoding!=="base64"||!Number.isSafeInteger(raw.size)||raw.size<0)
      throw repositoryFailure(REPO_ERRORS.PROTOCOL);
    if(raw.size>maxBytes)throw repositoryFailure(REPO_ERRORS.TOO_LARGE);
    const bytes=decode64(raw.content,maxBytes);
    if(bytes.length!==raw.size)throw repositoryFailure(REPO_ERRORS.PROTOCOL);
    return bytes;
  }
  return Object.freeze({describe,resolveRef,listTree,readBlob});
}
