const $=id=>document.getElementById(id);
const canvas=$("c"),ctx=canvas.getContext("2d");
let ws,id,players=[],shots=[],keys={},mouse={x:400,y:300},roomCode="",round=1;

function connect(type,name,room){
  ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
  ws.onopen=()=>{
    const payload=type==="create"?{type:"create",name}:{type:"join",name,room};
    ws.send(JSON.stringify(payload));
  };
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="joined"){
      id=m.id;roomCode=m.room;round=m.round;
      $("roomLabel").textContent="ROOM "+roomCode;
      $("round").textContent="ROUND "+round;
      $("menu").classList.add("hidden");$("game").classList.remove("hidden");
      $("status").textContent="Room created. Send the code to your friends!";
    }
    if(m.type==="state"){players=m.players;shots=m.shots;draw();}
    if(m.type==="round"){round=m.round;$("round").textContent="ROUND "+round;}
    if(m.type==="winner")$("status").textContent=m.name+" wins the round!";
    if(m.type==="notice")$("status").textContent=m.message;
    if(m.type==="eliminated")$("status").textContent=m.name+" eliminated!";
    if(m.type==="error"){$("status").textContent=m.message; if(ws)ws.close();}
  };
  ws.onerror=()=>{$("status").textContent="Connection error. Please refresh and try again.";};
  ws.onclose=()=>{if(!id)$("status").textContent="Connection failed. Please refresh and try again.";};
}
function start(type){
  const name=$("name").value.trim()||"Player";
  const room=$("room").value.trim().toUpperCase();
  $("status").textContent="Connecting...";
  connect(type,name,room);
}
$("create").onclick=()=>start("create");
$("join").onclick=()=>start("join");
addEventListener("keydown",e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==="r"&&ws)location.reload()});
addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);
canvas.addEventListener("mousemove",e=>{const r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)*800/r.width;mouse.y=(e.clientY-r.top)*600/r.height});
canvas.addEventListener("mousedown",()=>{const p=players.find(x=>x.id===id);if(p&&ws.readyState===1)ws.send(JSON.stringify({type:"shoot",tx:mouse.x,ty:mouse.y}))});
setInterval(()=>{
  if(!ws||ws.readyState!==1)return;
  let dx=0,dy=0;
  if(keys.w||keys.arrowup)dy--;if(keys.s||keys.arrowdown)dy++;
  if(keys.a||keys.arrowleft)dx--;if(keys.d||keys.arrowright)dx++;
  if(dx||dy)ws.send(JSON.stringify({type:"move",dx,dy}))
},50);

function draw(){
 ctx.clearRect(0,0,800,600);ctx.fillStyle="#0b1020";ctx.fillRect(0,0,800,600);
 ctx.strokeStyle="#17213a";
 for(let x=0;x<800;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,600);ctx.stroke()}
 for(let y=0;y<600;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(800,y);ctx.stroke()}
 for(const s of shots){ctx.beginPath();ctx.arc(s.x,s.y,6,0,7);ctx.fillStyle="#fff";ctx.fill()}
 for(const p of players){
   ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=p.alive?1:.25;
   ctx.beginPath();
   for(let i=0;i<6;i++){let a=i*Math.PI/3;let xx=Math.cos(a)*19,yy=Math.sin(a)*19;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}
   ctx.closePath();
   ctx.fillStyle=["#62e6ff","#ff6b9d","#9dff6b","#ffd166","#b78cff","#ff9466"][p.color%6];ctx.fill();
   ctx.strokeStyle="#fff8";ctx.stroke();
   ctx.fillStyle="#fff";ctx.font="12px system-ui";ctx.textAlign="center";ctx.fillText(p.name,0,-27);
   ctx.fillStyle="#182033";ctx.fillRect(-20,23,40,5);ctx.fillStyle="#6df";ctx.fillRect(-20,23,40*(p.hp/100),5);
   ctx.restore();
 }
}
