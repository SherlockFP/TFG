# Wave29 contextual route help

The previous guided attempt steered into a side fixture before reaching the actual
airlock. Native furnished routes are valid; no collider, door clearance or LOS
bypass was added. The existing baked PSX atlas now identifies the actual opening,
as described in [ship-route](ship-route.md).

The existing single objective now follows the ordinary moon route:

- Empty hands/pockets aboard before first facility entry: leave through AIRLOCK.
- Outside before entry: find the actual facility entrance, with native distance.
- Carrying local hotbar or pocket salvage outside: return/camera-loss advice.
- Carrying that same salvage aboard: unload inside the ship, including after entry.
- After native drop: unloading advice disappears; native host collection retains
  its existing once-only value/XP rules.

Warnings retain their existing priority. Home, Company, expedition destinations
and Dead Letter retain their own objective ownership/filtering. The carried-item
fix and native controls are documented in [expedition](expedition.md).
No new popup, marker, required task, currency or unlock gate is introduced.

AIRLOCK, unloading and the revised route-only terminal hint have English, Turkish
and Russian strings. The full status card no longer advertises STORE/BUY away
from physical traders. The source keys use the existing localization system;
native integration and the fresh guided replay own actual behavior proof.
A successful guided route does not establish blind-human discovery or enjoyment.
