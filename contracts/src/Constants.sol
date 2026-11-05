// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// Product slug. Everything a user signs starts with these, so changing them means redeploying.
string constant INTENT_HEADER = "sereno v1";
string constant SIGNING_NAMESPACE = "sereno@v1";

// git signs commits in this SSHSIG namespace.
string constant GIT_NAMESPACE = "git";
