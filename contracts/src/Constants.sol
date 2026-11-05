// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// Working product name. Everything a user signs starts with these, so renaming means redeploying.
string constant INTENT_HEADER = "tangerine v1";
string constant SIGNING_NAMESPACE = "tangerine@v1";

// git signs commits in this SSHSIG namespace.
string constant GIT_NAMESPACE = "git";
