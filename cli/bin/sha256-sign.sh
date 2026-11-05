#!/bin/sh
# git's gpg.ssh.program: sign with SHA-256 (git defaults to SHA-512, about 640k extra gas to verify on-chain).
# AK_SSH_KEYGEN picks the ssh-keygen (for example Win32-OpenSSH 10.x for a phone key).
K="${AK_SSH_KEYGEN:-ssh-keygen}"
[ "$1" = "-Y" ] && [ "$2" = sign ] && exec "$K" -O hashalg=sha256 "$@"
exec "$K" "$@"
