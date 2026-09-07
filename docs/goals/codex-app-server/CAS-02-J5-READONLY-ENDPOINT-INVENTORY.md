# CAS-02 J5 Read-Only Endpoint Inventory Charter

**Host:** `j5-estimating-dev`  
**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** external-checkpoint operator, read-only  
**Terminal:** `EXISTING_ENDPOINT_FOUND` or `PROVISIONING_REQUIRED`

## Objective

Determine whether `j5-estimating-dev` already exposes an authorized non-local authenticated `wss://` Codex App Server 0.151.0 endpoint that the CAS-02 worker can test. Return only a safe endpoint descriptor: WSS URL, expected version, public-CA status or absolute CA-certificate reference, and a credential-reference identifier. Never return credential material.

## Authority and required reading

Read the global `openai-docs` skill and current official Codex App Server documentation before inspection. Official requirements are non-local WSS, WebSocket authentication before `initialize`, and a separate capability/signed-bearer credential—not the Codex access token.

## Strict read-only boundary

- Do not create, edit, move, or delete any file, repository state, service, process, socket, certificate, secret, user, firewall rule, proxy route, package, environment configuration, or scheduled job.
- Do not start, stop, restart, reload, enable, disable, signal, or attach to any process/service/container.
- Do not install packages or run Git mutations.
- Do not print, copy, hash, decode, export, or otherwise reveal raw tokens, shared secrets, Codex credentials, private keys, environment values, or secret-file contents. Environment variable names and secret-reference paths may be reported only when values are not read.
- Read-only host commands may inspect versions, process/listener metadata, service status/definitions, container metadata, reverse-proxy routing, certificate metadata, and filesystem metadata. Avoid opening files likely to contain secret values.
- Remote App Server RPCs, if an endpoint already exists and a safe credential reference is resolvable, are limited to connection initialization, health/capability inspection, and `account/read`. Never call thread, turn, command, process, filesystem-write, approval, archive, login, logout, or configuration mutation methods.
- Do not treat the transport used to run this inventory task as CAS-02 WSS evidence. No SSH/tmux/Herdr/plaintext/local-fixture substitution certifies the checkpoint.

## Checks

1. Confirm the installed Codex CLI version without changing it.
2. Inventory existing Codex App Server processes, listeners, service/container definitions, and reverse-proxy/TLS routes using read-only commands.
3. Identify only endpoints that are non-local `wss://`, authenticated, reachable from the CAS-02 host, and expected version 0.151.0.
4. Confirm certificate trust from metadata or public handshake without bypassing verification.
5. Identify a credential reference that CAS-02 can resolve without placing the raw token in chat, argv, manifests, events, or evidence.
6. If every requirement is already satisfied, return `EXISTING_ENDPOINT_FOUND` with safe references and exact read-only evidence.
7. Otherwise return `PROVISIONING_REQUIRED`, list the missing components, and give the smallest provisioning plan. Do not execute it.

## Stop

Do not write an artifact file. Return a concise final response with command names and redacted findings. Stop immediately on any risk of secret disclosure or mutation.
