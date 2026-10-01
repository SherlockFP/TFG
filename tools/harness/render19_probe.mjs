// Private bounded browser diagnostic. Pass armRender19Probe directly to page.addInitScript.
// No product import, persistent hook or FPS benchmark. Call window.__render19Probe.stop() after capture.
export function armRender19Probe() {
  const cap=6000,errors=[],saved=[],owners=new Map();let draws=0,stopped=false;
  const probe=window.__render19Probe={errors,draws:0,stop};
  function engine(){return window.kefal?.engine||window.kefal?.game?.engine;}
  function attach(){
    const e=engine(),r=e?.renderer;if(!r||owners.has(r))return;
    const original=r.renderBufferDirect,entry={original,context:null};owners.set(r,entry);
    r.renderBufferDirect=function(camera,scene,geometry,material,object,group){
      const prev=entry.context;entry.context={scene:scene===e.scene?'main':scene===e.postScene?'post':'other',object:{name:object.name,type:object.type,uuid:object.uuid},material:{name:material.name,type:material.type,uuid:material.uuid,map:material.map?{uuid:material.map.uuid,type:material.map.type,isRenderTargetTexture:material.map.isRenderTargetTexture,imageType:material.map.image?.constructor?.name,source:material.map.source?.uuid}:null},parents:(()=>{const out=[];for(let p=object.parent;p&&out.length<8;p=p.parent)out.push({name:p.name,type:p.type,uuid:p.uuid});return out;})()};
      try{return original.call(this,camera,scene,geometry,material,object,group);}finally{entry.context=prev;}
    };
  }
  function stop(){if(stopped)return;stopped=true;clearInterval(poll);for(const[p,k,v]of saved)p[k]=v;for(const[r,v]of owners)r.renderBufferDirect=v.original;}
  function capture(gl,error){
    const e=engine(),r=e?.renderer,isMain=r?.getContext()===gl;
    const framebuffer=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING??gl.FRAMEBUFFER_BINDING),target=gl.DRAW_FRAMEBUFFER??gl.FRAMEBUFFER,attachments=[];
    if(framebuffer)for(const[name,id]of [['color0',gl.COLOR_ATTACHMENT0],['depth',gl.DEPTH_ATTACHMENT],['stencil',gl.STENCIL_ATTACHMENT]]){
      const object=gl.getFramebufferAttachmentParameter(target,id,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);if(object)attachments.push({name,object});
    }
    function textureName(t){for(const[name,tex]of [['engine.color',e?.rt?.texture],['engine.depth',e?.rt?.depthTexture],['current.color',r?.getRenderTarget()?.texture],['current.depth',r?.getRenderTarget()?.depthTexture]])if(tex&&r.properties.get(tex).__webglTexture===t)return name+':'+tex.uuid;return t?'other-texture':'null';}
    const bindings=new Map([[gl.SAMPLER_2D,gl.TEXTURE_BINDING_2D],[gl.SAMPLER_2D_SHADOW,gl.TEXTURE_BINDING_2D],[gl.INT_SAMPLER_2D,gl.TEXTURE_BINDING_2D],[gl.UNSIGNED_INT_SAMPLER_2D,gl.TEXTURE_BINDING_2D],[gl.SAMPLER_CUBE,gl.TEXTURE_BINDING_CUBE_MAP],[gl.SAMPLER_CUBE_SHADOW,gl.TEXTURE_BINDING_CUBE_MAP],[gl.SAMPLER_3D,gl.TEXTURE_BINDING_3D],[gl.SAMPLER_2D_ARRAY,gl.TEXTURE_BINDING_2D_ARRAY],[gl.SAMPLER_2D_ARRAY_SHADOW,gl.TEXTURE_BINDING_2D_ARRAY]]);
    const active=gl.getParameter(gl.ACTIVE_TEXTURE),program=gl.getParameter(gl.CURRENT_PROGRAM),samplers=[];
    try{const n=program?gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS):0;for(let i=0;i<n;i++){
      const u=gl.getActiveUniform(program,i),binding=bindings.get(u.type);if(!binding)continue;
      const val=gl.getUniform(program,gl.getUniformLocation(program,u.name));for(const unit of typeof val==='number'?[val]:Array.from(val||[])){
        gl.activeTexture(gl.TEXTURE0+unit);const texture=gl.getParameter(binding);samplers.push({name:u.name,unit,texture:textureName(texture),attachmentMatches:attachments.filter(a=>a.object===texture).map(a=>a.name)});
      }
    }}finally{gl.activeTexture(active);}
    return {error,isMain,phase:window.kefal?.game?.run?.phase,owner:owners.get(r)?.context||null,rendererTarget:r?.getRenderTarget()?.texture?.uuid||null,actualFramebuffer:!!framebuffer,program:program?{linked:gl.getProgramParameter(program,gl.LINK_STATUS),activeUniforms:gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS)}:null,attachments:attachments.map(a=>({name:a.name,texture:textureName(a.object)})),samplers};
  }
  const poll=setInterval(attach,10);
  for(const cls of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
    if(!cls)continue;const p=cls.prototype;
    for(const k of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
      if(!Object.hasOwn(p,k)||typeof p[k]!=='function')continue;const original=p[k];saved.push([p,k,original]);
      p[k]=function(...args){attach();const result=original.apply(this,args);if(stopped)return result;
        const e=engine(),main=e?.renderer?.getContext()===this;
        // Include startup draws before the app is exposed; once known, auxiliary UI contexts are excluded.
        if(!e||main){probe.draws=++draws;const error=this.getError();if(error!==this.NO_ERROR){try{errors.push(capture(this,error));}catch(err){errors.push({error,captureError:String(err)});}}if(draws>=cap||errors.length>=4)stop();}
        return result;
      };
    }
  }
}
