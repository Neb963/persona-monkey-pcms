function text(value){return value===null||value===undefined?"":String(value);}

export function createPcmsOperatorBridge({documentRef=globalThis.document,navigatorRef=globalThis.navigator}={}){
  if(!documentRef?.createElement) throw new TypeError("Operator bridge requires a document");
  let pending=false;

  async function choose({title,instructions,source=null,sourceHash=null,choices=[]}={}){
    if(pending) throw new Error("Another PCMS operator action is already active");
    if(!Array.isArray(choices)||choices.length<1) throw new TypeError("Operator choices are required");
    pending=true;
    const dialog=documentRef.createElement("dialog");
    dialog.className="operator-dialog";
    const form=documentRef.createElement("form");
    form.method="dialog";
    form.className="operator-dialog-body";

    const heading=documentRef.createElement("h3");
    heading.textContent=text(title)||"Operator action";
    const help=documentRef.createElement("p");
    help.textContent=text(instructions);
    form.append(heading,help);

    if(sourceHash){
      const hash=documentRef.createElement("code");
      hash.className="operator-hash";
      hash.textContent="SHA-256: "+text(sourceHash);
      form.append(hash);
    }
    if(source!==null){
      const label=documentRef.createElement("label");
      label.textContent="Desired source";
      const area=documentRef.createElement("textarea");
      area.readOnly=true;
      area.rows=12;
      area.value=text(source);
      area.className="operator-source";
      const copy=documentRef.createElement("button");
      copy.type="button";
      copy.textContent="Copy source";
      copy.addEventListener("click",async()=>{
        try{
          await navigatorRef?.clipboard?.writeText?.(area.value);
          copy.textContent="Copied";
        }catch{
          area.focus();
          area.select();
          copy.textContent="Selected — press Ctrl+C";
        }
      });
      label.append(area,copy);
      form.append(label);
    }

    const actions=documentRef.createElement("div");
    actions.className="operator-actions";
    for(const choice of choices){
      const button=documentRef.createElement("button");
      button.type="submit";
      button.value=String(choice);
      button.textContent=String(choice).replaceAll("_"," ");
      actions.append(button);
    }
    const close=documentRef.createElement("button");
    close.type="button";
    close.textContent="Leave uncertain";
    actions.append(close);
    form.append(actions);
    dialog.append(form);
    documentRef.body.append(dialog);

    return new Promise((resolve,reject)=>{
      let settled=false;
      function finish(value,failed=false){
        if(settled) return;
        settled=true;
        pending=false;
        try{dialog.close();}catch{}
        dialog.remove();
        if(failed) reject(value); else resolve(value);
      }
      form.addEventListener("submit",(event)=>{
        event.preventDefault();
        const submitter=event.submitter;
        finish(submitter?.value||null);
      });
      close.addEventListener("click",()=>finish(new Error("Operator left outcome uncertain"),true));
      dialog.addEventListener("cancel",(event)=>{
        event.preventDefault();
        finish(new Error("Operator left outcome uncertain"),true);
      });
      try{dialog.showModal();}
      catch(error){finish(error,true);}
    });
  }

  return Object.freeze({choose});
}
