/**
 * Copyright 2012 Google, Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('blk.graphics.RenderState');

goog.require('blk.assets.blocksets.test');
goog.require('blk.assets.fonts.MonospaceFont');
goog.require('blk.assets.programs.FaceProgram');
goog.require('blk.assets.programs.LineProgram');
goog.require('blk.assets.textures.ui');
goog.require('blk.graphics.BlockBuilder');
goog.require('gf.graphics.BlendState');
goog.require('gf.graphics.DepthState');
goog.require('gf.graphics.RasterizerState');
goog.require('gf.graphics.Resource');
goog.require('gf.graphics.SpriteBuffer');
goog.require('gf.graphics.SpriteProgram');
goog.require('goog.asserts');
goog.require('goog.webgl');



/**
 * Graphics rendering state.
 *
 * TODO(benvanik): I don't like this - lines/sprites should be with their
 * buffers, not here where apps need to think about them... may need to move
 * some of render state down into gf...
 *
 * @constructor
 * @extends {gf.graphics.Resource}
 * @param {!gf.Runtime} runtime Current runtime.
 * @param {!gf.assets.AssetManager} assetManager Asset manager.
 * @param {!gf.graphics.GraphicsContext} graphicsContext Graphics context.
 */
blk.graphics.RenderState = function(runtime, assetManager, graphicsContext) {
  goog.base(this, graphicsContext);

  /**
   * Current mode.
   * @type {blk.graphics.RenderState.Mode}
   */
  this.mode = blk.graphics.RenderState.Mode.UNKNOWN;

  /**
   * Font.
   * @type {!blk.assets.fonts.MonospaceFont}
   */
  this.font = new blk.assets.fonts.MonospaceFont(
      runtime, assetManager, graphicsContext);
  this.registerDisposable(this.font);

  /**
   * Block texture atlas.
   * @type {!gf.graphics.TextureAtlas}
   */
  this.blockAtlas = blk.assets.blocksets.test.create(
      assetManager, graphicsContext);
  this.registerDisposable(this.blockAtlas);
  this.blockAtlas.setFilteringMode(goog.webgl.NEAREST, goog.webgl.NEAREST);
  this.blockAtlas.load();

  /**
   * UI texture atlas.
   * @type {!gf.graphics.TextureAtlas}
   */
  this.uiAtlas = blk.assets.textures.ui.create(
      assetManager, graphicsContext);
  this.uiAtlas.setFilteringMode(goog.webgl.NEAREST, goog.webgl.NEAREST);
  this.registerDisposable(this.uiAtlas);
  this.uiAtlas.load();

  /**
   * Line program.
   * @type {!blk.assets.programs.LineProgram}
   */
  this.lineProgram = blk.assets.programs.LineProgram.create(
      assetManager, graphicsContext);
  this.registerDisposable(this.lineProgram);
  this.lineProgram.restore();

  /**
   * Sprite program.
   * @private
   * @type {gf.graphics.SpriteProgram}
   */
  this.spriteProgram_ = /** @type {gf.graphics.SpriteProgram} */ (
      graphicsContext.getSharedProgram(gf.graphics.SpriteProgram));
  goog.asserts.assert(this.spriteProgram_);

  /**
   * Shared index buffer used for drawing sprites.
   * @private
   * @type {WebGLBuffer}
   */
  this.spriteIndexBuffer_ = null;

  /**
   * Shared index buffer used for drawing blocks.
   * @private
   * @type {WebGLBuffer}
   */
  this.blockIndexBuffer_ = null;

  /**
   * Shared block builder.
   * @type {!blk.graphics.BlockBuilder}
   */
  this.blockBuilder = new blk.graphics.BlockBuilder(this);
  this.registerDisposable(this.blockBuilder);

  /**
   * Program used to render faces.
   * @type {!blk.assets.programs.FaceProgram}
   */
  this.faceProgram = blk.assets.programs.FaceProgram.create(
      assetManager, graphicsContext);
  this.registerDisposable(this.faceProgram);

  this.faceProgram.load();
};
goog.inherits(blk.graphics.RenderState, gf.graphics.Resource);


/**
 * Cached rasterizer state.
 * @private
 * @type {!gf.graphics.RasterizerState}
 */
blk.graphics.RenderState.RASTERIZER_STATE_ = (function() {
  var state = new gf.graphics.RasterizerState();
  state.cullFaceEnabled = true;
  return state;
})();


/**
 * Render state mode.
 * @enum {number}
 */
blk.graphics.RenderState.Mode = {
  /**
   * Clean state, no current mode.
   */
  UNKNOWN: 0,
  /**
   * Chunk pass 1, set by {@see blk.graphics.RenderState#beginChunkPass1}.
   */
  CHUNK_PASS1: 2,
  /**
   * Chunk pass 2, set by {@see blk.graphics.RenderState#beginChunkPass2}.
   */
  CHUNK_PASS2: 3,
  /**
   * Line drawing mode, set by {@see blk.graphics.RenderState#beginLines}.
   */
  LINES: 4,
  /**
   * 2D sprites.
   */
  SPRITES: 5
};


/**
 * Cached blend state used for {@see blk.graphics.RenderState.Mode#CHUNK_PASS1}.
 * @private
 * @type {!gf.graphics.BlendState}
 */
blk.graphics.RenderState.BLEND_CHUNK_PASS1_ = (function() {
  var state = new gf.graphics.BlendState();
  return state;
})();


/**
 * Cached depth state used for {@see blk.graphics.RenderState.Mode#CHUNK_PASS1}.
 * @private
 * @type {!gf.graphics.DepthState}
 */
blk.graphics.RenderState.DEPTH_CHUNK_PASS1_ = (function() {
  var state = new gf.graphics.DepthState();
  state.depthTestEnabled = true;
  state.depthFunc = goog.webgl.LEQUAL;
  return state;
})();


/**
 * Cached blend state used for {@see blk.graphics.RenderState.Mode#CHUNK_PASS2}.
 * @private
 * @type {!gf.graphics.BlendState}
 */
blk.graphics.RenderState.BLEND_CHUNK_PASS2_ = (function() {
  var state = new gf.graphics.BlendState();
  return state;
})();


/**
 * Cached depth state used for {@see blk.graphics.RenderState.Mode#CHUNK_PASS2}.
 * @private
 * @type {!gf.graphics.DepthState}
 */
blk.graphics.RenderState.DEPTH_CHUNK_PASS2_ = (function() {
  var state = new gf.graphics.DepthState();
  state.depthTestEnabled = true;
  state.depthFunc = goog.webgl.LEQUAL;
  return state;
})();


/**
 * Cached blend state used for {@see blk.graphics.RenderState.Mode#LINES}.
 * @private
 * @type {!gf.graphics.BlendState}
 */
blk.graphics.RenderState.BLEND_LINES_ = (function() {
  var state = new gf.graphics.BlendState();
  return state;
})();


/**
 * Cached depth state used for {@see blk.graphics.RenderState.Mode#LINES}.
 * @private
 * @type {!gf.graphics.DepthState}
 */
blk.graphics.RenderState.DEPTH_LINES_ = (function() {
  var state = new gf.graphics.DepthState();
  state.depthTestEnabled = true;
  state.depthFunc = goog.webgl.LEQUAL;
  return state;
})();


/**
 * Cached blend state used for {@see blk.graphics.RenderState.Mode#SPRITES}.
 * @private
 * @type {!gf.graphics.BlendState}
 */
blk.graphics.RenderState.BLEND_SPRITES_ = (function() {
  var state = new gf.graphics.BlendState();
  return state;
})();


/**
 * Cached depth state used for {@see blk.graphics.RenderState.Mode#SPRITES}
 * when depth testing is enabled.
 * @private
 * @type {!gf.graphics.DepthState}
 */
blk.graphics.RenderState.DEPTH_ENABLED_SPRITES_ = (function() {
  var state = new gf.graphics.DepthState();
  state.depthTestEnabled = true;
  state.depthFunc = goog.webgl.LEQUAL;
  return state;
})();


/**
 * Cached depth state used for {@see blk.graphics.RenderState.Mode#SPRITES}
 * when depth testing is enabled.
 * @private
 * @type {!gf.graphics.DepthState}
 */
blk.graphics.RenderState.DEPTH_DISABLED_SPRITES_ = (function() {
  var state = new gf.graphics.DepthState();
  state.depthTestEnabled = false;
  state.depthFunc = goog.webgl.LEQUAL;
  return state;
})();


/**
 * @override
 */
blk.graphics.RenderState.prototype.discard = function() {
  var gl = this.graphicsContext.gl;

  gl.deleteBuffer(this.spriteIndexBuffer_);
  this.spriteIndexBuffer_ = null;

  gl.deleteBuffer(this.blockIndexBuffer_);
  this.blockIndexBuffer_ = null;
};


/**
 * @override
 */
blk.graphics.RenderState.prototype.restore = function() {
  var gl = this.graphicsContext.gl;
  goog.asserts.assert(gl);

  // Sprite indices
  goog.asserts.assert(!this.spriteIndexBuffer_);
  this.spriteIndexBuffer_ = gf.graphics.SpriteBuffer.createIndexBuffer(gl);

  // Face indices
  goog.asserts.assert(!this.blockIndexBuffer_);
  this.blockIndexBuffer_ = blk.graphics.BlockBuilder.createIndexBuffer(gl);
};


/**
 * Resets all render state, such at the beginning of a frame.
 * @param {!gf.vec.Viewport} viewport Viewport instance.
 * @param {!goog.vec.Vec4.Type} clearColor RGBA color.
 * @param {boolean} clear True to clear the color buffer.
 */
blk.graphics.RenderState.prototype.reset = function(
    viewport, clearColor, clear) {
  var ctx = this.graphicsContext;
  var gl = ctx.gl;

  ctx.setRasterizerState(blk.graphics.RenderState.RASTERIZER_STATE_);

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
  gl.clearDepth(1);
  gl.clear(
      (clear ? goog.webgl.COLOR_BUFFER_BIT : 0) | goog.webgl.DEPTH_BUFFER_BIT);

  this.mode = blk.graphics.RenderState.Mode.UNKNOWN;
};


/**
 * Sets the lighting/fog parameters for the scene.
 * @param {!goog.vec.Vec3.Type} ambientLightColor Ambient lighting color.
 * @param {!goog.vec.Vec3.Type} sunLightDirection Normalized sun lighting
 *     direction vector.
 * @param {!goog.vec.Vec3.Type} sunLightColor Sun lighting color.
 * @param {number} fogNear Fog near z value.
 * @param {number} fogFar Fog far z value.
 * @param {!goog.vec.Vec3.Type} fogColor Fog color.
 */
blk.graphics.RenderState.prototype.setLighting = function(
    ambientLightColor,
    sunLightDirection, sunLightColor,
    fogNear, fogFar, fogColor) {
  var gl = this.graphicsContext.gl;

  // Line program
  var lineProgram = this.lineProgram;
  gl.useProgram(lineProgram.handle);
  gl.uniform2f(lineProgram.u_fogInfo,
      fogNear, fogFar);
  gl.uniform3f(lineProgram.u_fogColor,
      fogColor[0], fogColor[1], fogColor[2]);

  // Face program
  var faceProgram = this.faceProgram;
  gl.useProgram(faceProgram.handle);
  gl.uniform3f(faceProgram.u_ambientLightColor,
      ambientLightColor[0],
      ambientLightColor[1],
      ambientLightColor[2]);
  gl.uniform3f(faceProgram.u_sunLightDirection,
      sunLightDirection[0],
      sunLightDirection[1],
      sunLightDirection[2]);
  gl.uniform3f(faceProgram.u_sunLightColor,
      sunLightColor[0],
      sunLightColor[1],
      sunLightColor[2]);
  gl.uniform2f(faceProgram.u_fogInfo,
      fogNear, fogFar);
  gl.uniform3f(faceProgram.u_fogColor,
      fogColor[0], fogColor[1], fogColor[2]);
};


/**
 * Begins the chunk drawing pass 1 mode.
 */
blk.graphics.RenderState.prototype.beginChunkPass1 = function() {
  if (this.mode == blk.graphics.RenderState.Mode.CHUNK_PASS1) {
    return;
  }
  this.mode = blk.graphics.RenderState.Mode.CHUNK_PASS1;

  var ctx = this.graphicsContext;
  var gl = ctx.gl;

  ctx.setBlendState(blk.graphics.RenderState.BLEND_CHUNK_PASS1_);
  ctx.setDepthState(blk.graphics.RenderState.DEPTH_CHUNK_PASS1_);

  // Program
  gl.useProgram(this.faceProgram.handle);

  // Texture atlas
  if (this.blockAtlas.handle) {
    gl.bindTexture(goog.webgl.TEXTURE_2D, this.blockAtlas.handle);
    gl.uniform2f(this.faceProgram.u_texSize,
        this.blockAtlas.width, this.blockAtlas.height);
  } else {
    gl.bindTexture(goog.webgl.TEXTURE_2D, null);
  }

  // Index buffer used by face buffers
  gl.bindBuffer(goog.webgl.ELEMENT_ARRAY_BUFFER, this.blockIndexBuffer_);

  // TODO(benvanik): VAO
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.enableVertexAttribArray(2);
};


/**
 * Begins the chunk drawing pass 2 mode.
 */
blk.graphics.RenderState.prototype.beginChunkPass2 = function() {
  if (this.mode == blk.graphics.RenderState.Mode.CHUNK_PASS2) {
    return;
  }
  this.mode = blk.graphics.RenderState.Mode.CHUNK_PASS2;

  var ctx = this.graphicsContext;
  var gl = ctx.gl;

  ctx.setBlendState(blk.graphics.RenderState.BLEND_CHUNK_PASS2_);
  ctx.setDepthState(blk.graphics.RenderState.DEPTH_CHUNK_PASS2_);

  // Program
  gl.useProgram(this.faceProgram.handle);

  // Texture atlas
  if (this.blockAtlas.handle) {
    gl.bindTexture(goog.webgl.TEXTURE_2D, this.blockAtlas.handle);
    gl.uniform2f(this.faceProgram.u_texSize,
        this.blockAtlas.width, this.blockAtlas.height);
  } else {
    gl.bindTexture(goog.webgl.TEXTURE_2D, null);
  }

  // Index buffer used by face buffers
  gl.bindBuffer(goog.webgl.ELEMENT_ARRAY_BUFFER, this.blockIndexBuffer_);

  // TODO(benvanik): VAO
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.enableVertexAttribArray(2);
};


/**
 * Begins the line drawing mode.
 */
blk.graphics.RenderState.prototype.beginLines = function() {
  if (this.mode == blk.graphics.RenderState.Mode.LINES) {
    return;
  }
  this.mode = blk.graphics.RenderState.Mode.LINES;

  var ctx = this.graphicsContext;
  var gl = ctx.gl;

  ctx.setBlendState(blk.graphics.RenderState.BLEND_LINES_);
  ctx.setDepthState(blk.graphics.RenderState.DEPTH_LINES_);

  // Program
  gl.useProgram(this.lineProgram.handle);

  // TODO(benvanik): VAO
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.disableVertexAttribArray(2);
};


/**
 * Begins the sprite drawing mode.
 * @param {gf.graphics.TextureAtlas} atlas Texture atlas used for sprites.
 * @param {boolean} depthTest True to enable depth testing.
 */
blk.graphics.RenderState.prototype.beginSprites = function(atlas, depthTest) {
  this.mode = blk.graphics.RenderState.Mode.SPRITES;

  var ctx = this.graphicsContext;
  var gl = ctx.gl;

  ctx.setBlendState(blk.graphics.RenderState.BLEND_SPRITES_);
  ctx.setDepthState(depthTest ?
      blk.graphics.RenderState.DEPTH_ENABLED_SPRITES_ :
      blk.graphics.RenderState.DEPTH_DISABLED_SPRITES_);

  // Texture atlas
  if (atlas.handle) {
    gl.bindTexture(goog.webgl.TEXTURE_2D, atlas.handle);
  } else {
    gl.bindTexture(goog.webgl.TEXTURE_2D, null);
  }

  // Program
  gl.useProgram(this.spriteProgram_.program);

  // TODO(benvanik): VAO
  gl.bindBuffer(goog.webgl.ELEMENT_ARRAY_BUFFER, this.spriteIndexBuffer_);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.enableVertexAttribArray(2);
};