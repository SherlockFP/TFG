# Render18: feedback-loop diagnosis (read-only)

Wave17's actual host/peer software Chromium reports repeated `GL_INVALID_OPERATION: glDrawElements: Feedback loop formed between Framebuffer and active Texture`. There were no page/runtime errors. The warning is still unresolved; no responsible mesh or sampler has been proved. The last renderer.info counters (one call/two triangles) describe the post quad, not the main scene; Engine.sceneStats captures the main-scene count before the post render resets it.

## Source findings

Only three product paths set targets: Engine.render/resize, camera_item's still-photo capture and landingq's shader prewarm. Engine renders its main scene into its color/depth target, switches to null, then renders a separate post scene. Only the post material's tColor/tDepth uniforms reference the engine target; no product scene mesh referencing those target textures was found. The mirror variant shares those uniforms and is another post material, not a ship mirror camera. feedcams/feedcams2 are ordinary models/activity logic, not WebGL render-target feeds.

camera_item creates an independent photo target and restores the previous target, view-model visibility, lights and temporary mimic materials in finally. Its developed photo uses copied pixel data; no current source evidence shows its target fed back into the photo render. landingq temporarily targets the engine buffer for shader compile, then restores the prior target. These observations rule out a naive unconditional “switch to null before post” fix; that ordering already exists. They do not prove that raw GL framebuffer/texture bindings match the renderer's cached state at the offending draw.

The previous QA14 diagnostic checked renderBufferDirect over710 draws/two early frames and found no1282. It did not isolate a later company/facility frame while the warnings were occurring. Shader/material fixtures cannot prove absence of a real GPU feedback loop. No broad shader, mirror, texture-disposal or visual-quality change is justified yet.

## Shared-QA bounded diagnostic

Use the already owned shared browser while warnings are occurring; do not start an independent browser. Capture the first bad **actual GL draw**, rather than inferring the producer from a console warning or renderer.info. The following diagnostic is setup-labelled and synchronous, wraps at most two real engine frames/6000 draws, records at most four errors and restores every method and the active texture unit. It changes no scene objects, materials, uniforms, targets, AI or quality settings. Per-draw getError can stall software rendering, so it is a bounded producer probe, never a performance benchmark or persistent product hook.

```js
(() => {
  const e=kefal.engine,r=e.renderer,gl=r.getContext();
  const limit=6000,errors=[],methods=[],orig=r.renderBufferDirect;
  let context=null,draws=0;
  const samplerBindings=new Map([
    [gl.SAMPLER_2D,gl.TEXTURE_BINDING_2D],
    [gl.SAMPLER_2D_SHADOW,gl.TEXTURE_BINDING_2D],
    [gl.INT_SAMPLER_2D,gl.TEXTURE_BINDING_2D],
    [gl.UNSIGNED_INT_SAMPLER_2D,gl.TEXTURE_BINDING_2D],
    [gl.SAMPLER_CUBE,gl.TEXTURE_BINDING_CUBE_MAP],
    [gl.SAMPLER_CUBE_SHADOW,gl.TEXTURE_BINDING_CUBE_MAP],
    [gl.SAMPLER_3D,gl.TEXTURE_BINDING_3D],
    [gl.SAMPLER_2D_ARRAY,gl.TEXTURE_BINDING_2D_ARRAY],
    [gl.SAMPLER_2D_ARRAY_SHADOW,gl.TEXTURE_BINDING_2D_ARRAY]
  ]);
  const textureName=t => {
    const known=[['engine.color',e.rt?.texture],['engine.depth',e.rt?.depthTexture]];
    const rt=r.getRenderTarget();
    if(rt)known.push(['current.color',rt.texture],['current.depth',rt.depthTexture]);
    for(const [name,tex] of known)
      if(tex&&r.properties.get(tex).__webglTexture===t)return name+':'+tex.uuid;
    return t?'other-texture':'null';
  };
  const capture=error => {
    const framebuffer=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    const attachments=[];
    if(framebuffer)for(const [name,attachment] of [
      ['color0',gl.COLOR_ATTACHMENT0],['depth',gl.DEPTH_ATTACHMENT],
      ['stencil',gl.STENCIL_ATTACHMENT]
    ]){
      const object=gl.getFramebufferAttachmentParameter(gl.DRAW_FRAMEBUFFER,attachment,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
      if(object)attachments.push({name,object});
    }
    const program=gl.getParameter(gl.CURRENT_PROGRAM),samplers=[];
    const active=gl.getParameter(gl.ACTIVE_TEXTURE);
    try {
      const n=program?gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS):0;
      for(let i=0;i<n;i++){
        const u=gl.getActiveUniform(program,i),binding=samplerBindings.get(u.type);
        if(!binding)continue;
        const val=gl.getUniform(program,gl.getUniformLocation(program,u.name));
        for(const unit of typeof val==='number'?[val]:Array.from(val||[])){
          gl.activeTexture(gl.TEXTURE0+unit);
          const texture=gl.getParameter(binding);
          samplers.push({name:u.name,unit,texture:textureName(texture),
            attachmentMatches:attachments.filter(a=>a.object===texture).map(a=>a.name)});
        }
      }
    } finally {gl.activeTexture(active);}
    return {error,phase:kefal.game?.run?.phase,scene:context?.scene,
      object:context?.object,material:context?.material,
      rendererTarget:r.getRenderTarget()?.texture?.uuid||null,
      actualFramebuffer:!!framebuffer,
      attachments:attachments.map(a=>({name:a.name,texture:textureName(a.object)})),samplers};
  };
  for(let i=0;i<8&&gl.getError()!==gl.NO_ERROR;i++){}
  r.renderBufferDirect=function(camera,scene,geometry,material,object,group){
    const previous=context;
    context={scene:scene===e.scene?'main':scene===e.postScene?'post':'other',
      object:{name:object.name,type:object.type,uuid:object.uuid},
      material:{name:material.name,type:material.type,uuid:material.uuid}};
    try{return orig.call(this,camera,scene,geometry,material,object,group);}
    finally{context=previous;}
  };
  try {
    for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
      if(typeof gl[name]!=='function')continue;
      const old=gl[name],own=Object.hasOwn(gl,name);methods.push({name,old,own});
      gl[name]=function(...args){
        const value=old.apply(gl,args);
        if(draws++<limit&&errors.length<4&&gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)){
          const error=gl.getError();
          if(error!==gl.NO_ERROR)errors.push(capture(error));
        }
        return value;
      };
    }
    e.render(1/60);e.render(1/60);
  } finally {
    r.renderBufferDirect=orig;
    for(const {name,old,own} of methods)if(own)gl[name]=old;else delete gl[name];
  }
  return {drawsObserved:Math.min(draws,limit),totalDraws:draws,
    sceneStats:e.sceneStats,phase:kefal.game?.run?.phase,errors};
})()
```

A nonempty sampler attachmentMatches is direct proof of the feedback pair. Report the scene/object/material, sampler name/unit, matching color/depth attachment and rendererTarget versus actualFramebuffer. If post is sampled while the raw framebuffer is still engine.color/depth despite rendererTarget null, investigate the concrete state transition; if a main-scene material samples the attached target, fix that exact material/pass. If the probe has no error while console warnings recur, retain the result as inconclusive and probe the actual warning phase/draw boundary; do not relabel it as fixed. gl.getError consumes errors, and context/program queries may themselves require careful interpretation, so preserve the unwrapped warning evidence separately.

Root approval is required before product edits in this lane. The smallest meaningful regression depends on the producer: a render-order/state-restoration test for a pass bug, or a real target/sampler identity test for a material bug, followed by shared browser confirmation. Neither source scans nor Node-only fixtures can establish that the actual WebGL warning is gone.
