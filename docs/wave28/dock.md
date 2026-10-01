# Wave28 dock interaction

Source inspected: main `053ed66`, before Wave28 changes. The baseline guided browser
images showed the crosshair on the broker's CRT with no E prompt, while looking at
the empty aisle beside the desk selected `Fleet broker`:
[fleet-head-aim-960.png](qa_shots/fleet-head-aim-960.png) and
[fleet-anchor-guided-960.png](qa_shots/fleet-anchor-guided-960.png). This was an interaction anchor defect, not an actor X offset.

The actual original `dockmaster18.glb`, parsed through Three's GLTF loader and the
production external-model cache, has its actor node at local `[0, 0, 0]`. Its
`dockmaster18_actor_dock18_screen` center is local `[0, 1.955, 0.628]`; the hub's
`[0, -1.25, 31]` placement puts it at world `[0, 0.705, 31.628]`. The previous
`HUB13_BROKER = [0, 0.2, 30]` was about 1.70 m from that screen. The shared point is
now **`[0, 0.70, 31.56]`**, immediately in front of the visible CRT. Native E,
guidance, route metadata and the existing host proximity gate use the same point.
The physical counter remains unchanged, with top Y `-0.05`; no collision or LOS
bypass was added.

The asset-missing fallback faces the same customer aisle. Its real visor center is
`[0, 0.0725, 31.6700]`. The existing native 1 m interaction radius accepts aim at
that shorter face too; the fallback and original model require no geometry changes.

## Native verification

`tools/harness/world15.test.mjs` now checks both the fallback built before asset
preload and the actual GLB loaded through the production loader. A labelled initial
arrival fixture uses the native `LocalPlayer` standing capsule/controller to walk
to the customer stance. It reaches feet `[1.8000, -1.2335, 29.8000]`, with eye
Y `0.3865`; no final-position teleport is used. Aiming at each model's real screen
selects `Fleet broker` through the actual `actionMethods.findInteraction` and
installed Fleet13 interactable hook. Native LOS clears the real counter. The old
point reproduces the original GLB head-aim miss; an inserted real Rapier wall
rejects E, and removing it restores the prompt.

The installed host purchase callback continues to reject dead/downed hosts, peers
and a host at the distant arrival point. The physically reached living host can
claim Courier while keeping the original 60 credits. The existing route,
four-hull clearance and map disposal checks also pass.

Command: `node tools/harness/world15.test.mjs` with the Node22 environment activated.
Result: PASS; log `/tmp/tfg-dock28-native-first.log` (2.1 s local process duration).
This is `NATIVE_INTEGRATION` with canvas/asset-transport fixtures. It does not prove
fresh browser keyboard input, blind discoverability, visual quality or hardware
performance. The fresh guided browser replay confirms CRT aim → normal E → fleet panel;
see [PLAYTEST](PLAYTEST.md) for its source boundary and native input evidence. Fleet marker persistence is a
separate Controls27 change.
