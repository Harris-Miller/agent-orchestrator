# jsonrpc-echo

A quick and dirty open CLI tool that receives stdin, outputs stdout JSON-RPC messages to mimic ACP basic communications

```bash
printf '%s\n' \
  '{ "jsonrpc": "2.0", "id": 1, "method": "initialize" }' \
  '{ "jsonrpc": "2.0", "id": 2, "method": "message", "params": { "echos": ["Hello", "World"] } }' \
  '{ "jsonrpc": "2.0", "id": 3, "method": "nope", "params": {} }' \
  '{ "jsonrpc": "2.0", "id": 2, "method": "message", "params": { "echos": [] } }' \
| bun run src/main.ts
```
