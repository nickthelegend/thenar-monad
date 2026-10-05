// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @dev The ERC-165 interface (https://eips.ethereum.org/EIPS/eip-165), as Chainlink's CRE docs use it.
interface IERC165 {
  function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
