/**
 * Coordinate System Manager
 *
 * Handles conversions between three coordinate spaces:
 * 1. Grid Space: Logical grid cells (e.g., {gridX: 3, gridY: 2})
 * 2. Board Canvas Space: Pixel positions on main board canvas
 * 3. Overlay Canvas Space: Pixel positions on animation overlay canvas
 *
 * The overlay is inset from the board by overlayInsetCells on all sides,
 * creating visible margins around the board content.
 */
class CoordinateSystem {
  /**
   * @param {number} cellSize - Size of one grid cell in pixels
   * @param {number} boardWidth - Width of board canvas in pixels
   * @param {number} boardHeight - Height of board canvas in pixels
   * @param {number} overlayInsetCells - Inset amount in cells (e.g., 0.5 for half-cell margins)
   */
  constructor(cellSize, boardWidth, boardHeight, overlayInsetCells) {
    this.cellSize = cellSize;
    this.boardWidth = boardWidth;
    this.boardHeight = boardHeight;
    this.overlayInsetCells = overlayInsetCells; // e.g., 0.5
    this.overlayInsetPixels = overlayInsetCells * cellSize;
  }

  /**
   * Convert grid coordinates to board canvas pixel coordinates
   * @param {number} gridX - Grid x position
   * @param {number} gridY - Grid y position
   * @returns {{x: number, y: number}} Board canvas pixel position
   */
  gridToBoardPixel(gridX, gridY) {
    return {
      x: gridX * this.cellSize,
      y: gridY * this.cellSize
    };
  }

  /**
   * Convert board canvas pixel coordinates to overlay canvas pixel coordinates
   * @param {number} boardX - Board canvas x position in pixels
   * @param {number} boardY - Board canvas y position in pixels
   * @returns {{x: number, y: number}} Overlay canvas pixel position
   */
  boardPixelToOverlayPixel(boardX, boardY) {
    return {
      x: boardX - this.overlayInsetPixels,
      y: boardY - this.overlayInsetPixels
    };
  }

  /**
   * Convert grid coordinates directly to overlay canvas pixel coordinates
   * @param {number} gridX - Grid x position
   * @param {number} gridY - Grid y position
   * @returns {{x: number, y: number}} Overlay canvas pixel position
   */
  gridToOverlayPixel(gridX, gridY) {
    const board = this.gridToBoardPixel(gridX, gridY);
    return this.boardPixelToOverlayPixel(board.x, board.y);
  }

  /**
   * Get the dimensions of the overlay canvas
   * @returns {{width: number, height: number}} Overlay canvas dimensions
   */
  getOverlayDimensions() {
    return {
      width: this.boardWidth - 2 * this.overlayInsetPixels,
      height: this.boardHeight - 2 * this.overlayInsetPixels
    };
  }

  /**
   * Get the translation vector needed to render board coordinates in overlay canvas
   * Use with ctx.translate() before rendering board components to overlay
   * @returns {{x: number, y: number}} Translation vector
   */
  getBoardToOverlayTranslation() {
    return {
      x: -this.overlayInsetPixels,
      y: -this.overlayInsetPixels
    };
  }
}
