// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// What the gate forwards to: KeyOracle and BountyBoard both implement it.
interface IReportReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// Sits between the Chainlink CRE forwarder and our receivers (KeyOracle, BountyBoard), and decides which reports
/// get through. KeyOracle trusts exactly one forwarder address; setting it to this gate closes two holes:
///
///  1. The CRE *simulation* forwarder routes unsigned reports from anyone. While we run on it, only reports sent
///     (`tx.origin`) by an allowlisted broadcaster, the EOA behind `cre workflow simulate --broadcast`, pass. In
///     simulation the metadata's workflow owner is the same dummy for everyone, so the metadata alone can't tell us
///     apart from an attacker.
///  2. The production forwarder verifies DON signatures, but it is shared by every CRE user, so a report must also
///     come from *our* workflow: each (workflow name, workflow owner) pair in the metadata routes to one receiver,
///     and anything else is refused. With `openBroadcast` on, any transmitter may deliver.
///
/// Owner-managed and with a chain-independent constructor, so it has the same CREATE2 address on every chain.
contract ReportGate {
    address public immutable owner;
    /// The CRE forwarder whose calls the gate accepts.
    address public forwarder;
    /// Off while on the simulation forwarder: then only listed broadcasters may deliver.
    bool public openBroadcast;
    mapping(address => bool) public broadcaster;
    /// Receiver for reports from a workflow, keyed by the metadata's workflow name (see `nameKey`) and owner.
    mapping(bytes10 workflowName => mapping(address workflowOwner => address target)) public routeOf;

    event ForwarderSet(address forwarder);
    event OpenBroadcastSet(bool open);
    event BroadcasterSet(address indexed broadcaster, bool allowed);
    event RouteSet(bytes10 indexed workflowName, address indexed workflowOwner, address target);

    error NotOwner();
    error NotForwarder();
    error NotBroadcaster(address origin);
    error BadMetadata();
    error NoRoute(bytes10 workflowName, address workflowOwner);

    constructor(address owner_) {
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setForwarder(address forwarder_) external onlyOwner {
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    function setOpenBroadcast(bool open) external onlyOwner {
        openBroadcast = open;
        emit OpenBroadcastSet(open);
    }

    function setBroadcaster(address who, bool allowed) external onlyOwner {
        broadcaster[who] = allowed;
        emit BroadcasterSet(who, allowed);
    }

    /// `target = address(0)` removes the route.
    function setRoute(bytes10 workflowName, address workflowOwner, address target) external onlyOwner {
        routeOf[workflowName][workflowOwner] = target;
        emit RouteSet(workflowName, workflowOwner, target);
    }

    /// CRE receiver entry point. `metadata` = workflowId (32) ‖ workflowName (10) ‖ workflowOwner (20) ‖ reportId (2).
    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != forwarder || forwarder == address(0)) revert NotForwarder();
        // tx.origin on purpose: it is the EOA that broadcast the forwarder call, which a contract in between can't fake.
        if (!openBroadcast && !broadcaster[tx.origin]) revert NotBroadcaster(tx.origin);
        if (metadata.length < 62) revert BadMetadata();
        bytes10 name = bytes10(metadata[32:42]);
        address wfOwner = address(bytes20(metadata[42:62]));
        address target = routeOf[name][wfOwner];
        if (target == address(0)) revert NoRoute(name, wfOwner);
        IReportReceiver(target).onReport(metadata, report);
    }

    /// The metadata's workflow name for a `workflow-name` from workflow.yaml: the first 10 characters of the
    /// lowercase hex SHA-256 of the name, as ASCII bytes (for example "github-keys-base" → "d8efb75538").
    function nameKey(string calldata workflowName) external pure returns (bytes10 key) {
        bytes32 h = sha256(bytes(workflowName));
        bytes memory hexChars = "0123456789abcdef";
        bytes memory out = new bytes(10);
        for (uint256 i = 0; i < 5; i++) {
            out[2 * i] = hexChars[uint8(h[i]) >> 4];
            out[2 * i + 1] = hexChars[uint8(h[i]) & 0x0f];
        }
        key = bytes10(out);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == this.onReport.selector || interfaceId == 0x01ffc9a7; // IReceiver, ERC-165
    }
}
