# Source attribution

This plugin uses the GGAI Plugin Starter supplied by the user, associated with
https://github.com/0ogg/ggai-plugin-starter (package metadata: MIT).
Its build configuration and `src/stella-api.ts` were reused.

`src/vendor/session-text.ts` and `src/vendor/chat-messages.ts` are taken from
the user-supplied GGAI Stella Engine 0.0.46 archive (manifest author: gg00;
package metadata: MIT). Only their type-only session import path was changed.
Original comments and algorithms are retained. The original archive did not
contain a separate LICENSE file; no additional upstream copyright notice has
been invented.

`src/adapter.ts` isolates the dependency on the engine's internal read
interfaces. Engine source files and API methods are not patched at runtime.
