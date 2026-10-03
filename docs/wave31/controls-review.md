# Wave31 independent controls review

Commerce agent independently reviewed input/save migration, actual App.bindKeys,
Escape ownership, HUDcalm and drone control help. No gameplay source, test, browser
or Git changes were made by this reviewer. Final fresh bundled Node24 controls13,
controls28, escape27 and a11y checks passed **4/4**.

The native callbacks support the targeted changes: pointer unlock offers resume
without creating pause; an explicit Escape closes the current shared panel on
its first gesture; Ctrl/Meta shortcuts do not become movement/chat/status or
trigger recapture. Native panel/terminal handoff and minigame pending results are
retained. No P1 found in these changed paths. This is native fixture evidence,
not real browser fullscreen/F11/Alt-Tab ordering or proof for every UI layer.

Independent review reproduced P2: the settings UI accepted a new Ctrl binding
while Input silently ignored that same key. Running real `UI.startRebind`,
`bindKey` and `Input` produced:

```text
Before root repair:
acceptedBinding=ControlLeft; crouchAfterNativePress=false; keysDown=[]
bindKey(defaults, crouch, ControlLeft).ok=true
loadSettings(version5, crouch=ControlRight).keys.crouch=ControlRight

After root repair:
bindKey(defaults, crouch, ControlLeft/ControlRight).ok=false
UI.startRebind refused Ctrl with the existing reserved-key toast
acceptedBinding=KeyC; crouchAfterNativeC=true
loadSettings(version5, crouch=ControlRight).keys.crouch=KeyC
```

Assertions were made against actual methods and dispatched native key events;
only DOM/event surfaces and saved settings were fixtures. Rebinding reservation
and claimed-version-independent crouch repair therefore pass independent retest.

The first root repair still left an existing custom Ctrl action unusable:
`loadSettings({settingsVersion:5, keys:{crouch:'KeyC', flashlight:'ControlLeft'}})`
retains ControlLeft; a real Input receives the native Ctrl key and reports
`isDown('flashlight') === false`. Since the new Input disables Ctrl globally,
repairing crouch alone leaves previously supported custom Ctrl actions unusable.
Root extended the saved-binding repair to every residual Ctrl assignment,
regardless of claimed settings version. The reviewer reran actual UI rebind,
bindKey, loadSettings and Input with capture/cleanup-aware event fixtures:

```text
Ctrl rebind refused; C crouch remains functional
saved version5 flashlight=ControlLeft -> KeyF
native KeyF press -> isDown(flashlight)=true
custom crouch=KeyZ and magicWheel=KeyO preserved
```

That final retest passes. A preceding reviewer harness attempt used Node's
EventTarget capture-removal behavior and left its rebind capture installed; it
incorrectly blocked a later Input listener. Replacing that event surface with
the harness's explicit capture/removal semantics corrected the fixture without
changing production code. Both real production methods and assertions remained
the same.

No remaining P1/P2 found in the reviewed frozen controls changes. Remaining
limits: generic shared-panel fixtures do not construct every individual screen;
wheel/build/vault cancellation uses API fixtures. Native menu-room variants,
all cinematic/loading/landing overlays, every minigame and trusted browser
fullscreen/pointer-lock ordering are not established by this review. Root owns
the frozen browser acceptance, final full suite/build and publication.
