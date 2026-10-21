// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract USDCEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    enum EscrowStatus {
        Open,
        Released,
        Refunded
    }

    struct Escrow {
        uint256 id;
        address sender;
        address recipient;
        uint256 amount;
        string description;
        EscrowStatus status;
        uint256 createdAt;
    }

    error ZeroAddressRecipient();
    error AmountMustBeGreaterThanZero();
    error InvalidEscrowId(uint256 escrowId);
    error NotEscrowSender(address caller, uint256 escrowId);
    error EscrowNotOpen(uint256 escrowId, EscrowStatus currentStatus);

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        string description
    );

    event EscrowReleased(
        uint256 indexed escrowId,
        address indexed sender,
        address indexed recipient,
        uint256 amount
    );

    event EscrowRefunded(uint256 indexed escrowId, address indexed sender, uint256 amount);

    mapping(uint256 escrowId => Escrow escrow) private _escrows;
    mapping(address sender => uint256[] escrowIds) private _escrowsBySender;
    uint256 private _escrowCount;

    function createEscrow(
        address recipient,
        uint256 amount,
        string calldata description
    ) external nonReentrant returns (uint256) {
        if (recipient == address(0)) revert ZeroAddressRecipient();
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        USDC.safeTransferFrom(msg.sender, address(this), amount);

        uint256 newEscrowId = ++_escrowCount;

        _escrows[newEscrowId] = Escrow({
            id: newEscrowId,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            description: description,
            status: EscrowStatus.Open,
            createdAt: block.timestamp
        });

        _escrowsBySender[msg.sender].push(newEscrowId);

        emit EscrowCreated(newEscrowId, msg.sender, recipient, amount, description);

        return newEscrowId;
    }

    function releaseEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrowStorage(escrowId);

        if (escrow.sender != msg.sender) revert NotEscrowSender(msg.sender, escrowId);
        if (escrow.status != EscrowStatus.Open) revert EscrowNotOpen(escrowId, escrow.status);

        escrow.status = EscrowStatus.Released;
        USDC.safeTransfer(escrow.recipient, escrow.amount);

        emit EscrowReleased(escrowId, escrow.sender, escrow.recipient, escrow.amount);
    }

    function refundEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrowStorage(escrowId);

        if (escrow.sender != msg.sender) revert NotEscrowSender(msg.sender, escrowId);
        if (escrow.status != EscrowStatus.Open) revert EscrowNotOpen(escrowId, escrow.status);

        escrow.status = EscrowStatus.Refunded;
        USDC.safeTransfer(escrow.sender, escrow.amount);

        emit EscrowRefunded(escrowId, escrow.sender, escrow.amount);
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrows[_validateEscrowId(escrowId)];
    }

    function getEscrowsBySender(address sender) external view returns (uint256[] memory) {
        return _escrowsBySender[sender];
    }

    function escrowCount() external view returns (uint256) {
        return _escrowCount;
    }

    function _validateEscrowId(uint256 escrowId) internal view returns (uint256) {
        if (escrowId == 0 || escrowId > _escrowCount) revert InvalidEscrowId(escrowId);
        return escrowId;
    }

    function _getEscrowStorage(uint256 escrowId) internal view returns (Escrow storage escrow) {
        return _escrows[_validateEscrowId(escrowId)];
    }
}
