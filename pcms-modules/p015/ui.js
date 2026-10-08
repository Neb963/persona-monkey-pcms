// P037 Deployer built-in UI. Uses P033's bounded contribution protocol; no custom page authority.
function receipt(message,status="OK",label="Updated"){
  return {status:{token:status,label},message};
}
export function createUiContribution({moduleId="deployer",service}={}){
  if(!service||typeof service.read!=="function"||typeof service.startScan!=="function"
     ||typeof service.scanStep!=="function")throw new TypeError("Deployer UI requires repository service");
  const target=(slug)=>({kind:"module-object",moduleId,view:"generator",id:slug});
  const actions=[
    {id:"connect",label:"Set repository",appliesTo:"module",risk:"LOCAL",input:[
      {key:"owner",label:"GitHub owner",kind:"text",required:true,maxLength:100},
      {key:"repo",label:"Repository name",kind:"text",required:true,maxLength:100},
      {key:"ref",label:"Branch or tag",kind:"text",required:true,maxLength:200,default:"main"},
      {key:"accessType",label:"Access",kind:"choice",required:true,default:"public",
        options:[{id:"public",label:"Public"},{id:"private",label:"Private (SecretRef)"}]},
      {key:"secretRef",label:"SecretRef for private access (not token)",kind:"text",maxLength:100},
      {key:"root",label:"Root folder (optional)",kind:"text",maxLength:256},
      {key:"listing",label:"Default listing",kind:"choice",required:true,options:[
        {id:"unlisted",label:"Unlisted"},{id:"public",label:"Publicly listed"}]}
    ]},
    {id:"check",label:"Check now",appliesTo:"module",risk:"LOCAL"},
    {id:"continue",label:"Continue scan",appliesTo:"module",risk:"LOCAL"},
    {id:"link",label:"Link account folder",appliesTo:"module",risk:"BINDING",input:[
      {key:"folder",label:"Repository folder",kind:"text",required:true,maxLength:100},
      {key:"account",label:"PCMS account",kind:"entity",entityKind:"account",required:true}]},
    {id:"adopt",label:"Adopt into repository",appliesTo:"module-object:generator",risk:"BINDING"},
    {id:"deploy",label:"Deploy assisted",appliesTo:"module-object:generator",risk:"EXTERNAL_MUTATION"}
  ];
  const href="#/m/"+moduleId;
  function displayItems(value){
    const normal=(value.snapshot?.items??[]).map(item=>({id:item.slug,item,error:null}));
    const errors=(value.snapshot?.problems??[]).map((bad,i)=>({id:"problem:"+i,item:null,error:bad}));
    return [...normal,...errors];
  }
  return {
    contractVersion:1,moduleId,title:"Deployer",description:"Repository releases, account links and assisted deployments.",
    icon:"cloud",nav:{label:"Deployer",order:20,statusFrom:"summary"},actions,
    page:{views:[{id:"releases",title:"Repository releases",type:"list",columns:[
      {id:"generator",label:"Generator",kind:"text"},
      {id:"release",label:"Release",kind:"text"},
      {id:"folder",label:"Folder",kind:"text"},
      {id:"state",label:"State",kind:"text"}],rowHref:"generator",
      actions:["connect","check","continue","link"]},
      {id:"generator",title:"Generator",type:"detail",actions:["adopt","deploy"]}]},
    async summary(){
      const {value}=await service.read();
      return {status:value.lastFailure?{token:"WARNING",label:"Check failed"}:
        value.scan?{token:"ACTIVE",label:"Scanning"}:value.snapshot?{token:"OK",label:"Checked"}:
        {token:"INFO",label:"Not configured"},
        headline:value.scan?"Repository check in progress":value.lastFailure?"Previous snapshot retained":
          value.snapshot?value.snapshot.items.length+" generator releases":"Configure a repository to get started",
        facts:[{label:"Commit",value:value.snapshot?.commitId?.slice(0,12)??"—"},
          {label:"Last successful check",value:value.lastSuccessfulScanAt??"Never"},
          {label:"Problems",value:String(value.snapshot?.problems?.length??0)},
          {label:"Scan step",value:value.scan?.step??"Idle"}],href};
    },
    async conditions(){
      const {value}=await service.read();
      if(!value.lastFailure)return [];
      return [{key:"repo-scan-failed",priority:"HIGH",status:{token:"ERROR",label:"Repository unavailable"},
        title:"Last repository scan failed ("+String(value.lastFailure.code).slice(0,80)+")",
        subject:{kind:"module",id:moduleId}}];
    },
    async listRows(_ctx,viewId,cursor=null){
      if(viewId!=="releases")throw new TypeError("Unknown Deployer view");
      const {value}=await service.read(),all=displayItems(value),offset=cursor??0;
      const slice=all.slice(offset,offset+100);
      return {rows:slice.map(({id,item,error})=>({id,cells:{
        generator:item?.title??error?.slug??"Unknown",
        release:item?.version??"—",
        folder:item?.accountFolder??error?.accountFolder??"—",
        state:error?.code??(value.links[item.accountFolder]?"Update ready / managed":"Unlinked account")
      }})),next:offset+100<all.length?offset+100:null};
    },
    async getDetail(_ctx,viewId,id){
      if(viewId!=="generator")throw new TypeError("Unknown Deployer detail");
      const {value}=await service.read(),row=displayItems(value).find(item=>item.id===id);
      if(!row)throw new TypeError("Generator not found");
      const item=row.item,bad=row.error;
      return {title:item?.title??bad?.slug??"Problem",sections:[{title:"Repository",facts:[
        {label:"Account folder",value:item?.accountFolder??bad?.accountFolder??"—"},
        {label:"Release",value:item?.version??"—"},
        {label:"Commit",value:value.snapshot?.commitId?.slice(0,12)??"—"},
        {label:"Validation",value:bad?.code??"Valid"}]}]};
    },
    async invoke(_ctx,actionId,ref,input,{mode}={}){
      if(mode==="preview"){
        return {status:{token:"INFO",label:"Ready"},message:"Review the repository action before continuing.",
          impact:{title:"Confirm Deployer action",consequences:["Only explicitly approved assisted deployments can mutate Perchance."],
            confirmLabel:"Continue"}};
      }
      if(actionId==="connect"){
        const current=await service.read();
        await service.configure({expectedRevision:current.revision,defaultListing:input.listing==="public"?"PUBLICLY_LISTED":"UNLISTED",
          config:{provider:"github",owner:input.owner,repo:input.repo,ref:input.ref,root:input.root??"",
            access:input.accessType==="private"?{kind:"token",secretRef:input.secretRef??""}:{kind:"public"},
            network:"default"}});
        return receipt("Repository configured. Select Check now to read the pinned commit.");
      }
      if(actionId==="link"){
        const current=await service.read();
        await service.linkFolder({folder:input.folder,accountId:input.account,expectedRevision:current.revision});
        return receipt("Folder linked to the selected account. Check again to prepare its releases.");
      }
      if(actionId==="check"){
        await service.startScan();
        const next=await service.scanStep();
        return receipt(next.done?"Repository check complete.":"Check started; select Continue scan to advance.",
          next.status==="FAILED"?"WARNING":"INFO",next.status==="FAILED"?"Check failed":"Scan");
      }
      if(actionId==="continue"){
        const next=await service.scanStep();
        return receipt(next.done?"Repository check complete.":"Scan checkpoint saved; continue until complete.",
          next.status==="FAILED"?"WARNING":"INFO",next.status==="FAILED"?"Check failed":"Scan");
      }
      if(!ref||ref.kind!=="module-object"||ref.view!=="generator")throw new TypeError("A generator is required");
      const current=await service.read();
      const item=current.value.snapshot?.items.find(it=>it.slug===ref.id);
      if(!item)throw new TypeError("This generator is not a valid repository release");
      if(actionId==="adopt"){
        const deployed=await service.getDeploymentForSlug(item.slug);
        await service.adopt({slug:item.slug,expectedRevision:deployed.revision});
        return receipt("Manual generator adopted into the repository.");
      }
      if(actionId==="deploy"){
        const deployed=await service.getDeploymentForSlug(item.slug);
        await service.deployFromRepository({deploymentId:deployed.deployment?.deploymentId,
          expectedRevision:deployed.revision});
        return receipt("Assisted deployment handed off for confirmation.","WAITING_HUMAN","Waiting for you");
      }
      throw new TypeError("Unknown Deployer action");
    }
  };
}
