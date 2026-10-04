// WordPad: original local rich-text desktop toy.
(() => {
  "use strict";
  const page=document.getElementById("Page"), state=document.getElementById("State"), count=document.getElementById("Count"), SAVE="rbx.wordpad.doc";
  let saved="";
  function update(){const s=page.innerText.trim(), words=s?s.split(/\s+/).length:0;count.textContent=`${words} words · ${s.length} chars`;state.textContent=saved===page.innerHTML?"Saved":"Modified";}
  function edit(cmd,value){page.focus();document.execCommand(cmd,false,value);saved="";update();}
  function newDoc(){page.innerHTML="";saved="";update();page.focus();}
  function save(){saved=page.innerHTML;AppKit.save(SAVE,saved);state.textContent="Saved locally";}
  function load(){const x=AppKit.load(SAVE,"");if(x){page.innerHTML=x;saved=x;state.textContent="Loaded locally";}update();}
  document.querySelectorAll("[data-cmd]").forEach((b)=>b.addEventListener("click",()=>edit(b.dataset.cmd)));
  document.getElementById("Font").addEventListener("change",(e)=>edit("fontName",e.target.value));document.getElementById("Size").addEventListener("change",(e)=>edit("fontSize",e.target.value));page.addEventListener("input",()=>{saved="";update();});
  AppKit.menubar(document.getElementById("Menu"),[{label:"&File",items:[{label:"&New",key:"N",action:newDoc},{label:"&Save",key:"S",action:save},{label:"&Load Last",action:load},"-",{label:"E&xit",action:()=>AppKit.host.close()}]},{label:"&Format",items:[{label:"&Bold",key:"B",action:()=>edit("bold")},{label:"&Italic",key:"I",action:()=>edit("italic")},{label:"&Underline",key:"U",action:()=>edit("underline")}]},{label:"&Help",items:[{label:"&About WordPad",action:()=>AppKit.alert("About WordPad","WordPad 1.0\nA local-only rich-text toy for RBXBanland.\nDocuments stay in this browser's local storage.","info")}]}]);
  addEventListener("keydown",(e)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();save();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="n"){e.preventDefault();newDoc();}});load();page.focus();
})();
