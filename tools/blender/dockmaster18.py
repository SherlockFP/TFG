"""Original TFG Relay Dock service sculpture. Run: blender -b --python tools/blender/dockmaster18.py.
Game coordinates +Y up, frontage -Z, metres. No third-party meshes/textures.
"""
import bpy, math, os, json
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../public/assets/original/dockmaster18.glb'))
# Muted workwear and cast metal: green is limited to three tiny terminal status pixels.
COLORS={'shell':(.085,.105,.11,1),'mint':(.07,.13,.105,1),'workwear':(.24,.205,.15,1),'cloth':(.12,.115,.105,1),'ivory':(.48,.46,.4,1),'amber':(.30,.18,.065,1),'screen':(.005,.007,.006,1)}
M={}
for k,c in COLORS.items():
 m=bpy.data.materials.new('dock18_'+k);m.diffuse_color=c;m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=c;p.inputs['Roughness'].default_value=.8
 if k=='mint':p.inputs['Emission Color'].default_value=(*c[:3],1);p.inputs['Emission Strength'].default_value=.025
 M[k]=m
parent=None
# Convert game XYZ to Blender XYZ (glTF exporter applies +Y up).
def pos(p):return (p[0],-p[2],p[1])
def part(obj,name,mat):
 obj.name=name;obj.data.materials.append(M[mat]);obj.parent=parent
 return obj
def box(name,p,size,mat,bevel=.05):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos(p));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('cast rounded edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 for f in o.data.polygons:f.use_smooth=False
 # Preserve authored face normals for a faceted PSX silhouette.
 return part(o,name,mat)
def oval(name,p,size,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=1,location=pos(p));o=bpy.context.object;o.scale=(size[0]/2,size[2]/2,size[1]/2);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for f in o.data.polygons:f.use_smooth=False
 return part(o,name,mat)
def rod(name,a,b,r,mat):
 av=Vector(pos(a));bv=Vector(pos(b));v=bv-av;bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=v.length,location=(av+bv)/2);o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
 for f in o.data.polygons:f.use_smooth=False
 return part(o,name,mat)
def group(name):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);return o
parent=group('dockmaster18_actor')
# Distinct rounded coverall silhouette, a CRT helmet and resting gloved hands.
for side in [-1,1]:
 x=side*.2;box('boot',(x,.15,1.02),(.29,.26,.46),'shell',.075);oval('trouser',(x,.52,1.04),(.34,.7,.37),'cloth')
box('overall pelvis',(0,.87,1.02),(.62,.35,.4),'cloth',.12)
oval('padded coverall',(0,1.23,1.02),(.88,.89,.5),'workwear')
box('overall chest bib',(0,1.27,.755),(.48,.54,.055),'cloth',.035)
for side in [-1,1]:
 box('webbing strap',(side*.18,1.57,.77),(.075,.25,.06),'ivory',.015)
 oval('shoulder',(side*.46,1.5,1.0),(.34,.37,.35),'workwear')
 rod('upper sleeve',(side*.46,1.43,.97),(side*.6,1.24,.56),.13,'workwear')
 oval('elbow',(side*.6,1.24,.56),(.29,.26,.3),'cloth')
 rod('forearm',(side*.6,1.23,.55),(side*.55,1.2,.07),.115,'workwear')
 box('cuff',(side*.55,1.2,.10),(.27,.2,.17),'cloth',.04)
 oval('resting glove',(side*.54,1.2,-.08),(.27,.2,.29),'ivory')
 for j in range(3):box('glove crease',(side*.54+(j-1)*.045,1.295,-.1),(.012,.006,.11),'shell',.002)
box('name badge',(.1,1.42,.718),(.21,.105,.025),'ivory',.01)
for x in [.04,.1,.16]:box('badge ticks',(x,1.42,.7),(.028,.018,.008),'shell',.002)
box('belt',(0,.95,.785),(.6,.085,.06),'shell',.02);box('belt buckle',(0,.95,.74),(.12,.08,.035),'amber',.02)
rod('helmet neck',(0,1.55,1.03),(0,1.78,1.03),.14,'cloth')
box('CRT helmet casing',(0,1.94,1.0),(.78,.66,.63),'shell',.15)
box('CRT cream bezel',(0,1.95,.671),(.68,.52,.06),'ivory',.075)
box('curved dark screen',(0,1.955,.628),(.56,.41,.07),'screen',.07)
for x in [-.13,.13]:
 box('pixel eye',(x,1.99,.584),(.11,.075,.013),'ivory',.012)
box('pixel smile',(0,1.84,.584),(.16,.026,.012),'ivory',.007)
for x in [-.08,.08]:box('smile corner',(x,1.855,.584),(.025,.038,.012),'ivory',.004)
box('helmet crown',(0,2.26,1.02),(.60,.10,.45),'cloth',.045)
for side in [-1,1]:
 oval('ear transmitter',(side*.415,1.98,1.0),(.13,.32,.30),'cloth')
 box('transmitter amber tag',(side*.487,1.98,1.0),(.025,.12,.11),'amber',.01)
rod('short aerial',(.24,2.27,1.10),(.24,2.45,1.10),.018,'shell');oval('aerial tip',(.24,2.46,1.10),(.065,.065,.065),'amber')
# Bespoke desk: cast skirt, worktop, recessed panels, crew-document trays and terminal.
parent=group('dockmaster18_desk')
box('cast reception skirt',(0,.58,0),(5.9,1.12,1.27),'shell',.17)
box('curved counter rim',(0,1.2,0),(6.15,.15,1.5),'ivory',.075)
box('mint desk inset',(0,.64,-.67),(4.9,.48,.07),'cloth',.06)
box('crew guidance rail',(0,.96,-.716),(5.5,.065,.026),'amber',.02)
for x in [-2.3,2.3]:
 box('inset cast ribs',(x,.5,-.7),(.18,.8,.10),'shell',.035)
 box('desk service latch',(x,.67,-.77),(.12,.18,.065),'amber',.02)
box('flat selection terminal',(1.55,1.45,.06),(.76,.38,.54),'shell',.075)
box('terminal screen',(1.55,1.48,-.226),(.60,.24,.025),'screen',.025)
for x in [1.33,1.53,1.73]:box('vessel status',(x,1.48,-.246),(.11,.025,.01),'mint',.006)
box('document tray',(-1.5,1.3,.02),(.9,.09,.53),'cloth',.04)
for j in range(3):box('fleet sheets',(-1.48+j*.045,1.36+j*.012,.02),(.57,.015,.37),'ivory',.012)
rod('desk mug',(-.92,1.31,.12),(-.92,1.50,.12),.09,'amber')
# Large cast facade replaces blocky visual front columns/header at existing outer edges.
parent=group('dockmaster18_facade')
for side in [-1,1]:
 box('rounded service jamb',(side*11.8,3.15,-6.55),(1.35,7.5,.9),'shell',.25)
 box('crew jamb channel',(side*11.65,3.05,-7.03),(.13,6.0,.04),'ivory',.035)
 for y in [1.5,2.5,3.5,4.5]:box('rib flange',(side*11.8,y,-6.97),(1.48,.10,.21),'cloth',.03)
box('cast lintel',(0,5.45,-6.6),(24.8,1.4,1.03),'shell',.3)
box('mint lintel seam',(0,4.73,-7.1),(23.8,.10,.035),'ivory',.025)
# Off-centre tower profile echoes transfer ribs without blocking the dispatch opening.
for x in [-9.3,-6.8,-4.3]:
 box('dispatch window bezel',(x,7.8,5.55),(1.9,2.2,.15),'cloth',.15)
 box('dispatch window glass',(x,7.8,5.44),(1.55,1.9,.08),'screen',.12)
 box('dispatch window reflection',(x-.5,7.8,5.39),(.075,1.5,.015),'ivory',.02)
# Original vertex wear: limited matte per-face tonal patches, no downloaded/PBR texture.
for obj in [o for o in list(bpy.data.objects) if o.type=='MESH']:
 wear=obj.data.color_attributes.new(name='dock18_wear',type='BYTE_COLOR',domain='CORNER')
 obj.data.color_attributes.active_color=wear
 for face in obj.data.polygons:
  band=((face.index*17+sum(ord(c) for c in obj.name))%11)
  value=[.78,.84,.9,.94,.98,1,1,1,1,1,1][band] if obj.data.materials[0].name not in ['dock18_mint','dock18_screen'] else 1
  for loop in face.loop_indices:wear.data[loop].color=(value,value,value,1)
# Merge by material and semantic group: <=18 primitives, no rig/update/texture/light.
for par in [o for o in list(bpy.data.objects) if o.type=='EMPTY']:
 children=[o for o in list(bpy.data.objects) if o.parent==par and o.type=='MESH']
 for mat in M.values():
  same=[o for o in list(bpy.data.objects) if o.parent==par and o.type=='MESH' and o.data.materials[0]==mat]
  if not same:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in same:o.select_set(True)
  bpy.context.view_layer.objects.active=same[0];bpy.ops.object.join();bpy.context.object.name=par.name+'_'+mat.name
os.makedirs(os.path.dirname(OUT),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',export_yup=True,export_apply=True,export_materials='EXPORT',export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_texcoords=False,export_cameras=False,export_lights=False)
meshes=[o for o in bpy.data.objects if o.type=='MESH'];tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
print('DOCKMASTER18',json.dumps({'bytes':os.path.getsize(OUT),'meshes':len(meshes),'triangles':tris,'materials':len(M),'source':'original Blender primitives, no third-party asset'}))
