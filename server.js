
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 6;
const rooms = new Map();
const publicDir = path.join(__dirname, "public");

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}
function cleanName(s) {
  return String(s || "Player").replace(/[<>]/g, "").slice(0, 14) || "Player";
}
function cleanRoom(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function newRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
}
function spawn() {
  const a = Math.random()*Math.PI*2, r = 140 + Math.random()*160;
  return {x:400+Math.cos(a)*r, y:300+Math.sin(a)*r};
}
function publicState(room) {
  return {
    type:"state",
    room:room.code,
    players:[...room.players.values()].map(p=>({
      id:p.id,name:p.name,x:p.x,y:p.y,hp:p.hp,score:p.score,alive:p.alive,color:p.color
    })),
    shots:room.shots.map(s=>({x:s.x,y:s.y,owner:s.owner}))
  };
}
function resetRound(room) {
  room.round++;
  room.shots=[];
  for (const p of room.players.values()) {
    const q=spawn(); p.x=q.x;p.y=q.y;p.hp=100;p.alive=true;
  }
  broadcast(room,{type:"round",round:room.round});
}
function checkWinner(room) {
  const alive=[...room.players.values()].filter(p=>p.alive);
  if (alive.length===1 && room.players.size>=2) {
    const winner=alive[0];
    winner.score++;
    broadcast(room,{type:"winner",name:winner.name,score:winner.score});
    setTimeout(()=>{ if(rooms.has(room.code)) resetRound(room); },2500);
  }
}

const server=http.createServer((req,res)=>{
  let u;
  try { u=new URL(req.url, "http://localhost"); } catch { res.writeHead(400); return res.end(); }
  let file=u.pathname==="/" ? "/index.html" : u.pathname;
  file=path.normalize(file).replace(/^(\.\.[\/\\])+/, "");
  const full=path.join(publicDir,file);
  if (!full.startsWith(publicDir)) {res.writeHead(403);return res.end();}
  fs.readFile(full,(err,data)=>{
    if(err){res.writeHead(404);return res.end("Not found");}
    const ext=path.extname(full);
    const types={".html":"text/html",".js":"text/javascript",".css":"text/css"};
    res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream"});
    res.end(data);
  });
});

const wss=new WebSocket.Server({server});
wss.on("connection",ws=>{
  let player=null, room=null;

  ws.on("message",raw=>{
    let m; try{m=JSON.parse(raw)}catch{return}
    if(m.type==="create"){
      if(player) return;
      const code=newRoomCode();
      room={code,players:new Map(),shots:[],round:1};
      rooms.set(code,room);
      joinPlayer(ws,room,cleanName(m.name));
    }
    if(m.type==="join"){
      if(player) return;
      const code=cleanRoom(m.room), r=rooms.get(code);
      if(!r) return send(ws,{type:"error",message:"Room not found."});
      if(r.players.size>=MAX_PLAYERS) return send(ws,{type:"error",message:"Room is full (6 max)."});
      joinPlayer(ws,r,cleanName(m.name));
    }
    if(!player || !room) return;

    if(m.type==="move"){
      if(!player.alive) return;
      const dx=Number(m.dx)||0,dy=Number(m.dy)||0;
      const len=Math.hypot(dx,dy)||1, speed=7;
      player.x=Math.max(25,Math.min(775,player.x+(dx/len)*speed));
      player.y=Math.max(25,Math.min(575,player.y+(dy/len)*speed));
    }

    if(m.type==="shoot"){
      if(!player.alive || Date.now()-player.lastShot<220) return;
      const tx=Number(m.tx),ty=Number(m.ty);
      if(!Number.isFinite(tx)||!Number.isFinite(ty)) return;
      const dx=tx-player.x,dy=ty-player.y,len=Math.hypot(dx,dy)||1;
      player.lastShot=Date.now();
      room.shots.push({x:player.x,y:player.y,vx:dx/len*14,vy:dy/len*14,owner:player.id,ttl:55});
    }
  });

  ws.on("close",()=>{
    if(player && room){
      room.players.delete(player.id);
      broadcast(room,{type:"notice",message:`${player.name} left the room.`});
      if(room.players.size===0) rooms.delete(room.code);
    }
  });

  function joinPlayer(sock,r,name){
    room=r;
    const q=spawn();
    player={
      id:Math.random().toString(36).slice(2,10), ws:sock,name,
      x:q.x,y:q.y,hp:100,score:0,alive:true,lastShot:0,
      color: room.players.size
    };
    room.players.set(player.id,player);
    send(sock,{type:"joined",id:player.id,room:room.code,round:room.round});
    broadcast(room,{type:"notice",message:`${player.name} joined.`});
  }
});

setInterval(()=>{
  for(const room of rooms.values()){
    for(let i=room.shots.length-1;i>=0;i--){
      const s=room.shots[i];
      s.x+=s.vx;s.y+=s.vy;s.ttl--;
      let remove=s.ttl<=0||s.x<0||s.x>800||s.y<0||s.y>600;
      if(!remove){
        for(const p of room.players.values()){
          if(p.id===s.owner||!p.alive) continue;
          if(Math.hypot(p.x-s.x,p.y-s.y)<22){
            p.hp-=25; remove=true;
            if(p.hp<=0){
              p.hp=0;p.alive=false;
              const killer=room.players.get(s.owner);
              if(killer) killer.score++;
              broadcast(room,{type:"eliminated",name:p.name});
              setTimeout(()=>{
                if(rooms.has(room.code) && room.players.has(p.id)){
                  const q=spawn();p.x=q.x;p.y=q.y;p.hp=100;p.alive=true;
                }
              },1800);
            }
            break;
          }
        }
      }
      if(remove) room.shots.splice(i,1);
    }
    broadcast(room,publicState(room));
  }
},50);

server.listen(PORT,()=>console.log(`HEX HUNT running on port ${PORT}`));
