(() => {
  const app = document.querySelector('#app');
  const canvas = document.querySelector('#effects');
  const ctx = canvas.getContext('2d');
  const fileItem = document.querySelector('#fileItem');
  const fileNameEl = document.querySelector('#fileName');
  const fileInput = document.querySelector('#fileInput');
  const dropZone = document.querySelector('#dropZone');
  const countEl = document.querySelector('#uploadedCount');
  const typeLabel = document.querySelector('#typeLabel');
  const basketSvg = document.querySelector('#basket');
  const announcement = document.querySelector('#announcement');

  const state = { file:null, uploaded:0, uploadedThisFile:false, mode:'idle', dragging:false, aim:null, x:0, y:0, vx:0, vy:0, angle:0, omega:0, w:20, h:24, last:0, sparks:[], announcementTimer:0, suppressClick:false, ringEntered:false, netTouched:false };
  const gravity=.30, restitution=.48;
  let W=0,H=0,dpr=1,accumulator=0;

  function metrics(){
    const r=app.getBoundingClientRect();
    W=r.width; H=r.height; dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
    canvas.style.width=`${W}px`; canvas.style.height=`${H}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    state.w=Math.min(20,W*.063);state.h=state.w*1.22;
    if(state.mode==='idle'||state.mode==='uploaded') placeAtStart();
    render();
  }
  // Keep the physics aligned with the visible SVG rim/net (viewBox 180×205,
  // rendered at top 32.2%, height 30%; rim y=100, net bottom y=180).
  function hoop(){return{x:W*.5,y:H*(.322+.30*100/205),r:W*.36*54/180,depth:H*.30*(180-100)/205};}
  function startPoint(){return{x:W*.20,y:H*.815};}
  function supportX(){const c=Math.cos(state.angle),s=Math.sin(state.angle);return Math.abs(c)*state.w+Math.abs(s)*state.h;}
  function supportY(){const c=Math.cos(state.angle),s=Math.sin(state.angle);return Math.abs(s)*state.w+Math.abs(c)*state.h;}
  function integrate(body,dt){const speed=Math.hypot(body.vx,body.vy),airDrag=Math.max(.985,1-.00022*speed*dt);body.vx*=Math.pow(.999,dt)*airDrag;body.vy=(body.vy+gravity*dt)*airDrag;body.x+=body.vx*dt;body.y+=body.vy*dt;if(body.angle!==undefined)body.angle+=body.omega*dt;if(body.omega!==undefined)body.omega*=Math.pow(.996,dt);}
  function placeAtStart(){const p=startPoint();state.x=p.x;state.y=p.y;state.angle=0;setFilePosition();}
  function setFilePosition(){fileItem.style.left=`${state.x/W*100}%`;fileItem.style.top=`${state.y/H*100}%`;fileItem.style.transform=`translate(-50%,-50%) rotate(${state.angle}rad)`;}
  function localPoint(e){const r=app.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function say(text){announcement.textContent=text;announcement.classList.add('show');clearTimeout(state.announcementTimer);state.announcementTimer=setTimeout(()=>announcement.classList.remove('show'),2100);}
  function extension(name){const v=(name.split('.').pop()||'FILE').toUpperCase();return v.length>4?'FILE':v;}
  function chooseFile(f){if(!f)return;state.file=f;state.uploadedThisFile=false;fileItem.classList.remove('is-uploaded');fileNameEl.textContent=f.name;fileNameEl.title=f.name;typeLabel.textContent=extension(f.name);if(state.mode==='uploaded')state.mode='idle';placeAtStart();say('Drag the file to aim, then release to shoot.');}
  dropZone.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',e=>chooseFile(e.target.files?.[0]));
  fileItem.addEventListener('click',()=>{if(state.suppressClick){state.suppressClick=false;return;}if(state.mode==='uploaded'||!state.file)fileInput.click();});
  fileItem.addEventListener('pointerdown',e=>{
    if(state.mode==='flying'||state.mode==='net'||state.mode==='loading'||state.uploadedThisFile)return;
    e.preventDefault();fileItem.setPointerCapture(e.pointerId);
    state.anchor=startPoint();state.grabOffset={x:state.x-localPoint(e).x,y:state.y-localPoint(e).y};
    state.dragging=true;state.suppressClick=false;state.mode='aiming';state.aim={x:state.x,y:state.y};app.classList.remove('is-over');
  });
  fileItem.addEventListener('pointermove',e=>{
    if(!state.dragging)return;
    const p=localPoint(e),a=state.anchor;
    if(Math.hypot(p.x+state.grabOffset.x-a.x,p.y+state.grabOffset.y-a.y)>8)state.suppressClick=true;
    const edge=Math.max(state.w+8,14);
    state.x=Math.max(edge,Math.min(W-edge,p.x+state.grabOffset.x));
    state.y=Math.max(edge,Math.min(H-edge,p.y+state.grabOffset.y));
    state.aim={x:state.x,y:state.y};setFilePosition();render();
  });
  fileItem.addEventListener('pointerup',()=>{
    if(!state.dragging)return;state.dragging=false;
    const a=state.anchor??startPoint(),pull=Math.hypot(state.x-a.x,state.y-a.y);
    if(pull<18){state.mode='idle';state.aim=null;placeAtStart();render();return;}
    takeShot();
  });
  fileItem.addEventListener('pointercancel',()=>{if(state.dragging){state.dragging=false;state.mode='idle';state.aim=null;placeAtStart();render();}});

  app.addEventListener('dragenter',e=>{e.preventDefault();app.classList.add('is-over');});
  app.addEventListener('dragover',e=>{e.preventDefault();app.classList.add('is-over');});
  app.addEventListener('dragleave',e=>{if(!app.contains(e.relatedTarget))app.classList.remove('is-over');});
  app.addEventListener('drop',e=>{e.preventDefault();app.classList.remove('is-over');chooseFile(e.dataTransfer?.files?.[0]);});

  function shotFor(pullPoint){
    const a=state.anchor||startPoint(),q=pullPoint||{x:state.x,y:state.y};
    const dx=q.x-a.x,dy=q.y-a.y,distance=Math.hypot(dx,dy);
    if(distance<1)return{vx:0,vy:0,pull:0};
    // The drag gesture directly steers the launch direction. The preview and
    // released file share the same velocity and gravity/drag simulation.
    const speed=Math.min(30,distance*.24);
    return{vx:dx/distance*speed,vy:dy/distance*speed,pull:distance};
  }
  function takeShot(){
    const a=state.anchor??startPoint(),pull=Math.hypot(state.x-a.x,state.y-a.y);
    if(pull<18){state.mode='idle';state.aim=null;placeAtStart();return;}
    const v=shotFor({x:state.x,y:state.y});
    state.vx=v.vx;state.vy=v.vy;state.angle=0;state.omega=(Math.random()-.5)*.016+(state.x-(state.anchor?.x??startPoint().x))*.00055;state.mode='flying';state.aim=null;state.hitNet=false;state.contact=false;state.netElapsed=0;state.ringEntered=false;state.netTouched=false;
    fileItem.classList.add('is-flying');fileItem.classList.remove('is-missing');
  }
  function hitRim(h){
    const c=Math.cos(state.angle),s=Math.sin(state.angle),rimRadius=2.2;
    for(const rx of [h.x-h.r,h.x+h.r]){
      let dx=state.x-rx,dy=state.y-h.y,d=Math.hypot(dx,dy);
      if(d<.001){dx=rx<h.x?-1:1;dy=0;d=1;}
      const nx=dx/d,ny=dy/d;
      // Project the rotated document rectangle onto the contact normal.
      const extent=Math.abs(nx*c+ny*s)*state.w+Math.abs(-nx*s+ny*c)*state.h;
      const contactDistance=extent+rimRadius;
      if(d<contactDistance){
        const penetration=contactDistance-d;
        state.x+=nx*(penetration+.05);state.y+=ny*(penetration+.05);
        const vn=state.vx*nx+state.vy*ny;
        if(vn<0){
          state.vx-=(1+restitution)*vn*nx;state.vy-=(1+restitution)*vn*ny;
          const tx=-ny,ty=nx,vt=state.vx*tx+state.vy*ty;
          state.vx-=vt*.12*tx;state.vy-=vt*.12*ty;
          state.omega+=(nx*state.vy-ny*state.vx)*.00045;state.vx*=.96;state.contact=true;
        }
      }
    }
  }
  function update(dt){
    if(state.mode==='flying'||state.mode==='net'){
      const h=hoop(),oldBottom=state.y+supportY();
      integrate(state,dt);
      if(state.mode==='flying'){
        hitRim(h);
        const bottom=state.y+supportY(),side=supportX();
        // Enter the net only after the whole file fits through the hoop opening from above.
        if(oldBottom<h.y+2&&bottom>=h.y+2&&state.vy>0){
          const clear=h.r-side-2.5;
          if(state.x>h.x-clear&&state.x<h.x+clear){state.mode='net';state.ringEntered=true;state.netElapsed=0;state.netTouched=false;basketSvg.classList.remove('shake');void basketSvg.offsetWidth;basketSvg.classList.add('shake');}
        }
      }
      if(state.mode==='net'){
        state.netElapsed+=dt;
        const side=supportX(),top=h.y+2,netBottom=h.y+h.depth;
        const progress=Math.min(1,Math.max(0,(state.y-top)/h.depth));
        // The net narrows gradually and absorbs horizontal energy as the file descends.
        const half=h.r*(1-.50*progress),centerLimit=Math.max(0,half-side);
        const left=h.x-centerLimit,right=h.x+centerLimit;
        if(state.x<left){state.x=left;state.vx=Math.abs(state.vx)*.22;state.vy*=.985;state.omega+=.012;state.netTouched=true;}
        if(state.x>right){state.x=right;state.vx=-Math.abs(state.vx)*.22;state.vy*=.985;state.omega-=.012;state.netTouched=true;}
        state.vx*=Math.pow(.988,dt);state.omega*=Math.pow(.982,dt);
        // Count only after the trailing edge clears the bottom of the net.
        if(state.ringEntered&&state.y-supportY()>netBottom)completeShot();
      }
      const sx=supportX(),sy=supportY();
      if(state.mode==='flying'){
        if(state.x-sx<0){state.x=sx;state.vx=Math.abs(state.vx)*.48;state.omega+=.025;}
        if(state.x+sx>W){state.x=W-sx;state.vx=-Math.abs(state.vx)*.48;state.omega-=.025;}
        if(state.y-sy<0){state.y=sy;state.vy=Math.abs(state.vy)*.35;}
        const ground=H*.965;
        if(state.y+sy>=ground){state.y=ground-sy;if(Math.abs(state.vy)>1.5){state.vy=-Math.abs(state.vy)*.38;state.vx*=.68;state.omega*=.62;}else missShot();}
      }
      if(state.x<-state.w||state.x>W+state.w||state.y>H+state.h)missShot();
      if(state.mode==='flying'||state.mode==='net')setFilePosition();
    }
    for(let i=state.sparks.length-1;i>=0;i--){const s=state.sparks[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=.08*dt;s.life-=.025*dt;if(s.life<=0)state.sparks.splice(i,1);}
  }
  function completeShot(){
    if(state.mode!=='net')return;
    state.mode='uploaded';state.vx=state.vy=0;state.uploadedThisFile=true;state.uploaded++;
    countEl.textContent=String(state.uploaded);fileItem.classList.remove('is-flying');fileItem.classList.add('is-uploaded');
    const h=hoop();for(let i=0;i<18;i++)state.sparks.push({x:h.x+(Math.random()-.5)*60,y:h.y+h.depth,vx:(Math.random()-.5)*2.4,vy:-Math.random()*2.6,life:.8+Math.random()*.3,size:1.3+Math.random()*2.4});
    say('Uploaded! Nice shot.');
    setTimeout(()=>{if(state.mode==='uploaded'){placeAtStart();render();}},800);
  }
  function missShot(){
    if(state.mode!=='flying'&&state.mode!=='net')return;
    state.mode='idle';state.vx=state.vy=0;state.contact=false;fileItem.classList.remove('is-flying');fileItem.classList.add('is-missing');placeAtStart();say('Missed — grab the file and try again.');setTimeout(()=>fileItem.classList.remove('is-missing'),400);
  }
  function drawAim(){
    if(state.mode!=='aiming'||!state.aim||!state.anchor)return;
    const q=state.aim;
    ctx.save();
    // Show only the predicted flight path; no slingshot bands or anchor marker.
    const v=shotFor(q),p={x:q.x,y:q.y,vx:v.vx,vy:v.vy,angle:state.angle,omega:0};ctx.strokeStyle='#c77b5480';ctx.lineWidth=1.35;ctx.setLineDash([2,6]);ctx.beginPath();ctx.moveTo(p.x,p.y);
    for(let i=0;i<120;i++){integrate(p,1);if(p.x<0||p.x>W||p.y>H)break;ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.setLineDash([]);ctx.restore();
  }
  function drawSparks(){for(const s of state.sparks){ctx.globalAlpha=Math.max(0,s.life);ctx.fillStyle='#c77b54';ctx.beginPath();ctx.arc(s.x,s.y,s.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  function render(){if(!ctx||!W)return;ctx.clearRect(0,0,W,H);drawAim();drawSparks();}
  function frame(ts){if(state.last){accumulator+=Math.min((ts-state.last)/16.667,4);while(accumulator>=1){update(1);accumulator-=1;}}state.last=ts;render();requestAnimationFrame(frame);}
  window.addEventListener('resize',metrics);metrics();placeAtStart();requestAnimationFrame(frame);
})();
