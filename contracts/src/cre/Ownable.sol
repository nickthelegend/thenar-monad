// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev The part of OpenZeppelin's Ownable (v5) that ReceiverTemplate uses, with
 * the same names, errors and event, so the template compiles unchanged without
 * pulling OpenZeppelin into this repository for one contract.
 */
abstract contract Ownable {
  address private _owner;

  error OwnableUnauthorizedAccount(address account);
  error OwnableInvalidOwner(address owner);

  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  constructor(address initialOwner) {
    if (initialOwner == address(0)) revert OwnableInvalidOwner(address(0));
    _transferOwnership(initialOwner);
  }

  modifier onlyOwner() {
    if (msg.sender != _owner) revert OwnableUnauthorizedAccount(msg.sender);
    _;
  }

  function owner() public view virtual returns (address) {
    return _owner;
  }

  function renounceOwnership() public virtual onlyOwner {
    _transferOwnership(address(0));
  }

  function transferOwnership(address newOwner) public virtual onlyOwner {
    if (newOwner == address(0)) revert OwnableInvalidOwner(address(0));
    _transferOwnership(newOwner);
  }

  function _transferOwnership(address newOwner) internal virtual {
    address oldOwner = _owner;
    _owner = newOwner;
    emit OwnershipTransferred(oldOwner, newOwner);
  }
}
