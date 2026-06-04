/**
 * Animation Player
 *
 * Orchestrates the define → permute → select → cleanup animation sequence
 * for hypothesis generation
 */

class AnimationPlayer {
  constructor(canvas, animationInstructions, level, animationAreaHeight, cellSize, boardRenderer, simulation, coordinateSystem, shuffleRng = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.instructions = animationInstructions;
    this.level = level;
    this.animationAreaHeight = animationAreaHeight || 200;
    if (!cellSize) {
      throw new Error('cellSize is required for AnimationPlayer');
    }
    this.cellSize = cellSize;
    this.boardRenderer = boardRenderer;
    this.simulation = simulation;
    this.coords = coordinateSystem;
    this.shuffleRng = shuffleRng;  // Seeded RNG for deterministic shuffle animations

    // Validate coordinate system and canvas dimensions
    if (this.coords) {
      const expectedDims = this.coords.getOverlayDimensions();
      if (canvas.width !== expectedDims.width || canvas.height !== expectedDims.height) {
        console.error(`Overlay canvas size mismatch! Expected ${expectedDims.width}x${expectedDims.height}, got ${canvas.width}x${canvas.height}`);
      }
    } else {
      console.warn('AnimationPlayer: No coordinate system provided');
    }

    // Animation state
    this.currentInstructionIndex = 0;
    this.currentPhase = null; // 'define', 'permute', 'select', 'cleanup'
    this.phaseStartTime = 0;
    this.phaseDuration = 0;
    this.isComplete = false;
    this.totalTime = 0;

    // Sack visual state (scaled to cellSize)
    this.sacks = []; // {listId, index, x, y, distribution, color, selected}
    // Position sacks in top area of overlay (overlaying the board)
    this.row1Y = cellSize * 1.2; // First row Y position
    this.rowY = this.row1Y;     // Legacy alias
    // Use shared renderer dimensions if available
    const renderer = window.SackRenderer;
    this.sackWidth = cellSize * (renderer?.SACK_WIDTH_RATIO || 0.8);
    this.sackHeight = cellSize * (renderer?.SACK_HEIGHT_RATIO || 0.85);
    this.sackSpacing = cellSize * 0.2;
    this.rowSpacing = this.sackHeight + cellSize * 0.3; // Vertical gap between rows
    this.row2Y = this.row1Y + this.rowSpacing;
    // Max sacks per row: how many fit in the canvas width
    this.maxPerRow = Math.floor((canvas.width + this.sackSpacing) / (this.sackWidth + this.sackSpacing));

    // Build list color map from level components
    // Each sack component has params.listId and params.listColor
    this.listColorMap = new Map();
    if (level.components) {
      level.components.forEach(comp => {
        if (comp.type === 'sack' && comp.params.listId && comp.params.listColor) {
          this.listColorMap.set(comp.params.listId, comp.params.listColor);
        }
      });
    }

    // Permutation animation state
    this.swapBatches = [];       // Batches of parallel swaps
    this.currentBatchIndex = 0;
    this.activeSwaps = [];       // Currently animating swaps
    this.swapStartTime = 0;
    this.swapsPerSecond = 2;

    // Callbacks
    this.onComplete = null;

    this.groupInstructionsByList();
  }

  /**
   * Compute (x, y) positions for n sacks, using 1 or 2 rows.
   * Second row is centered. Returns array of {x, y}.
   */
  computeSackPositions(n) {
    const positions = [];
    if (n <= this.maxPerRow) {
      // Single row
      const totalWidth = n * (this.sackWidth + this.sackSpacing) - this.sackSpacing;
      const startX = (this.canvas.width - totalWidth) / 2;
      for (let i = 0; i < n; i++) {
        positions.push({ x: startX + i * (this.sackWidth + this.sackSpacing), y: this.row1Y });
      }
    } else {
      // Two rows: first row gets ceil(n/2), second row gets floor(n/2), centered
      const row1Count = Math.ceil(n / 2);
      const row2Count = n - row1Count;

      const totalWidth1 = row1Count * (this.sackWidth + this.sackSpacing) - this.sackSpacing;
      const startX1 = (this.canvas.width - totalWidth1) / 2;
      for (let i = 0; i < row1Count; i++) {
        positions.push({ x: startX1 + i * (this.sackWidth + this.sackSpacing), y: this.row1Y });
      }

      const totalWidth2 = row2Count * (this.sackWidth + this.sackSpacing) - this.sackSpacing;
      const startX2 = (this.canvas.width - totalWidth2) / 2;
      for (let i = 0; i < row2Count; i++) {
        positions.push({ x: startX2 + i * (this.sackWidth + this.sackSpacing), y: this.row2Y });
      }
    }
    return positions;
  }

  /**
   * Group instructions by list for easier processing
   */
  groupInstructionsByList() {
    this.instructions.forEach((instr, idx) => {
    });

    this.listGroups = [];
    let currentList = null;
    let currentGroup = null;

    this.instructions.forEach(instruction => {
      if (instruction.listId !== currentList) {
        if (currentGroup) {
          this.listGroups.push(currentGroup);
        }
        currentList = instruction.listId;
        currentGroup = {
          listId: currentList,
          instructions: []
        };
      }
      currentGroup.instructions.push(instruction);
    });

    if (currentGroup) {
      this.listGroups.push(currentGroup);
    }

    this.listGroups.forEach((group, idx) => {
    });

    this.currentGroupIndex = 0;
  }

  /**
   * Start animation
   */
  start() {
    if (this.listGroups.length === 0) {
      this.isComplete = true;
      if (this.onComplete) this.onComplete();
      return;
    }

    this.startNextGroup();
  }

  /**
   * Start next list group
   */
  startNextGroup() {

    if (this.currentGroupIndex >= this.listGroups.length) {
      this.isComplete = true;
      // Clear sacks so they don't render during slide-up
      this.sacks = [];
      if (this.onComplete) this.onComplete();
      return;
    }

    const group = this.listGroups[this.currentGroupIndex];
    this.currentInstructionIndex = 0;
    this.startNextInstruction(group);
  }

  /**
   * Start next instruction in current group
   */
  startNextInstruction(group) {

    if (this.currentInstructionIndex >= group.instructions.length) {
      // Cleanup phase: move unused sacks off-screen
      this.startCleanupPhase(group);
      return;
    }

    const instruction = group.instructions[this.currentInstructionIndex];
    this.phaseStartTime = this.totalTime;

    switch (instruction.phase) {
      case 'define':
        this.startDefinePhase(instruction);
        break;
      case 'permute':
        this.startPermutePhase(instruction);
        break;
      case 'select':
        this.startSelectPhase(instruction);
        break;
    }
  }

  /**
   * Define phase: Show sacks in row, display distributions
   */
  startDefinePhase(instruction) {
    this.currentPhase = 'define';
    this.phaseDuration = 2000; // 2 seconds

    const distributions = instruction.distributions;
    const positions = this.computeSackPositions(distributions.length);

    // Create new sacks for this list
    const listColor = this.listColorMap.get(instruction.listId) || '#D4A574'; // Default to brown
    const newSacks = distributions.map((dist, i) => {
      return {
        listId: instruction.listId,
        originalIndex: i,
        currentIndex: i,
        x: positions[i].x,
        y: positions[i].y,
        renderX: -this.sackWidth - 20,  // Start off-screen left
        renderY: positions[i].y,
        distribution: dist,
        color: listColor,
        selected: false,
        showLabel: true,
        labelAlpha: 1.0,
        entering: true  // Mark as entering for animation
      };
    });

    // Keep previously selected sacks that are already on the board, add new sacks
    const selectedSacks = this.sacks.filter(s => s.selected);
    this.sacks = [...selectedSacks, ...newSacks];
  }

  /**
   * Permute phase: Shuffle sacks with swap animations
   * Visual animation is separate from actual distribution shuffling
   */
  startPermutePhase(instruction) {
    this.currentPhase = 'permute';

    // Find indices of sacks from this list (not previously selected ones)
    const currentListSackIndices = [];
    this.sacks.forEach((sack, idx) => {
      if (sack.listId === instruction.listId && !sack.selected) {
        currentListSackIndices.push(idx);
      }
    });

    this.currentListSackIndices = currentListSackIndices;

    // Initialize renderX/renderY to logical positions
    const n = currentListSackIndices.length;
    const positions = this.computeSackPositions(n);
    currentListSackIndices.forEach((idx, position) => {
      this.sacks[idx].x = positions[position].x;
      this.sacks[idx].y = positions[position].y;
      this.sacks[idx].renderX = positions[position].x;
      this.sacks[idx].renderY = positions[position].y;
    });

    // Store distributions for shuffling after animation
    this.distributionsToShuffle = currentListSackIndices.map(idx => this.sacks[idx].distribution);

    // Generate visual swap sequence (Fisher-Yates + random swaps)
    this.generateVisualSwapSequence(currentListSackIndices);

    // Permute phase completion is batch-driven, not time-driven
    this.phaseDuration = Infinity;
    this.activeSwaps = [];

    // Fade out labels
    currentListSackIndices.forEach(idx => {
      this.sacks[idx].showLabel = false;
    });
  }

  /**
   * Generate visual swap sequence: Fisher-Yates + random swaps
   * These are purely visual animations and don't affect actual distributions
   */
  generateVisualSwapSequence(indices) {
    const swaps = [];
    const n = indices.length;

    if (n <= 1) {
      this.swapBatches = [];
      this.currentBatchIndex = 0;
      return;
    }

    // Phase 1: Fisher-Yates shuffle pattern (visual only)
    for (let i = n - 1; i > 0; i--) {
      // Use seeded RNG if available, otherwise Math.random()
      const randomValue = this.shuffleRng ? this.shuffleRng.next() : Math.random();
      const j = Math.floor(randomValue * (i + 1));
      swaps.push({from: indices[i], to: indices[j]});
    }

    // Phase 2: Additional random swaps
    const numRandomSwaps = Math.max(10, n * 2);
    for (let k = 0; k < numRandomSwaps; k++) {
      const randomValue1 = this.shuffleRng ? this.shuffleRng.next() : Math.random();
      const randomValue2 = this.shuffleRng ? this.shuffleRng.next() : Math.random();
      const i = indices[Math.floor(randomValue1 * n)];
      const j = indices[Math.floor(randomValue2 * n)];
      if (i !== j) {
        swaps.push({from: i, to: j});
      }
    }

    // Group non-overlapping swaps into parallel batches
    // For 5+ sacks, swap floor((n-1)/2) pairs simultaneously
    const maxParallel = n >= 5 ? Math.floor((n - 1) / 2) : 1;
    const batches = [];
    let currentBatch = [];

    for (const swap of swaps) {
      const conflicts = currentBatch.some(s =>
        s.from === swap.from || s.from === swap.to ||
        s.to === swap.from || s.to === swap.to
      );

      if (!conflicts && currentBatch.length < maxParallel) {
        currentBatch.push(swap);
      } else {
        if (currentBatch.length > 0) batches.push(currentBatch);
        currentBatch = [swap];
      }
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    // Assign variable duration to each batch (accelerate then decelerate)
    const speeds = [0.5, 1, 1.5, 2, 1.5, 1];
    const durations = speeds.map(s => 500 / s);
    const totalBatches = batches.length;
    const totalSpeedWeight = speeds.reduce((a, b) => a + b);

    let batchesAssigned = 0;
    speeds.forEach((speed, segmentIdx) => {
      const batchesInSegment = segmentIdx === speeds.length - 1
        ? totalBatches - batchesAssigned
        : Math.floor((totalBatches / totalSpeedWeight) * speed);
      const swapDuration = durations[segmentIdx];
      for (let i = 0; i < batchesInSegment && batchesAssigned < totalBatches; i++) {
        batches[batchesAssigned].duration = swapDuration;
        batchesAssigned++;
      }
    });
    // Ensure all batches have a duration
    for (const batch of batches) {
      if (!batch.duration) batch.duration = 250;
    }

    this.swapBatches = batches;
    this.currentBatchIndex = 0;
  }

  /**
   * Select phase: Move selected sack to board
   */
  startSelectPhase(instruction) {
    this.currentPhase = 'select';
    this.phaseDuration = 1000; // 1 second per selection

    // Find sack at this index within the current list
    // instruction.index is relative to the current list (after permutation)
    // We need to find the sack with matching listId and currentIndex (position after shuffle)
    // NOT by filtering unselected and indexing, because that changes array indices!
    const sack = this.sacks.find(s =>
      s.listId === instruction.listId &&
      s.currentIndex === instruction.index &&
      !s.selected
    );

    if (!sack) {
      console.error(`[Animation] ERROR: Could not find sack at index ${instruction.index} in list ${instruction.listId}`);
      return;
    }


    if (sack) {
      sack.selected = true;
      sack.currentlySelecting = true; // Mark as the sack being moved RIGHT NOW
      sack.targetComponentId = instruction.templateId;
      // Use actual visual position after permutation, not logical position
      sack.selectStartX = sack.renderX !== undefined ? sack.renderX : sack.x;
      sack.selectStartY = sack.renderY !== undefined ? sack.renderY : this.rowY;


      // Find target position on board
      const component = this.level.components.find(c => c.params.linkedTemplate === instruction.templateId);
      if (component) {
        // Convert grid coordinates to overlay pixel coordinates using coordinate system
        const overlayPos = this.coords.gridToOverlayPixel(
          component.position.x,
          component.position.y
        );

        // Center sack in cell (with 5% downward offset matching board renderer)
        sack.targetX = overlayPos.x + (this.cellSize - this.sackWidth) / 2;
        sack.targetY = overlayPos.y + (this.cellSize - this.sackHeight) / 2 + this.cellSize * 0.05;

      } else {
        console.error(`[Animation] ERROR: Could not find component with linkedTemplate=${instruction.templateId}`);
      }
    }
  }

  /**
   * Cleanup phase: Move unused sacks off-screen
   */
  startCleanupPhase(group) {
    this.currentPhase = 'cleanup';
    this.phaseDuration = 1000; // 1 second
    this.phaseStartTime = this.totalTime; // Reset phase timer

    // Mark unused sacks for cleanup
    const unselectedSacks = this.sacks.filter(s => !s.selected);

    this.sacks.forEach((sack, i) => {
      if (!sack.selected) {
        sack.cleaningUp = true;
        sack.cleanupStartX = sack.renderX; // Capture current render position
        sack.cleanupStartY = sack.renderY;
        sack.targetX = this.canvas.width + 100; // Off-screen right
        sack.targetY = sack.renderY; // Keep same Y during cleanup slide
      }
    });
  }

  /**
   * Update animation state
   */
  update(deltaTime) {
    if (this.isComplete) return;

    this.totalTime += deltaTime;
    const phaseTime = this.totalTime - this.phaseStartTime;

    if (this.currentPhase === 'cleanup' && phaseTime < 100) {
    }

    if (this.currentPhase === 'define') {
      this.updateDefinePhase(phaseTime);
    } else if (this.currentPhase === 'permute') {
      this.updatePermutePhase(phaseTime);
    } else if (this.currentPhase === 'select') {
      this.updateSelectPhase(phaseTime);
    } else if (this.currentPhase === 'cleanup') {
      this.updateCleanupPhase(phaseTime);
    }

    // Check if phase is complete
    const phaseComplete = this.isPhaseComplete(phaseTime);
    if (phaseComplete) {
      this.advanceToNextPhase();
    }
  }

  /**
   * Check if current phase is complete
   */
  isPhaseComplete(phaseTime) {
    if (this.currentPhase === 'permute') {
      // For permute phase, check if all batches are done
      const allBatchesProcessed = this.currentBatchIndex >= this.swapBatches.length;
      const noActiveSwaps = this.activeSwaps.length === 0;
      return allBatchesProcessed && noActiveSwaps;
    } else {
      // For other phases, use time-based completion
      return phaseTime >= this.phaseDuration;
    }
  }

  /**
   * Update define phase (slide in from left, fade in/out labels)
   */
  updateDefinePhase(phaseTime) {
    const progress = phaseTime / this.phaseDuration;

    // Animate entering sacks sliding in from left (first 800ms)
    if (phaseTime <= 800) {
      const slideProgress = phaseTime / 800;
      const eased = this.easeInOutCubic(slideProgress);

      this.sacks.forEach(sack => {
        if (sack.entering) {
          const startX = -this.sackWidth - 20;
          sack.renderX = startX + (sack.x - startX) * eased;
        }
      });
    } else {
      // Mark entering animation complete
      this.sacks.forEach(sack => {
        if (sack.entering) {
          sack.entering = false;
          sack.renderX = sack.x;
        }
      });
    }

    // Fade out labels after 1.5 seconds
    if (phaseTime > 1500) {
      const fadeProgress = (phaseTime - 1500) / 500;
      this.sacks.forEach(sack => {
        sack.labelAlpha = Math.max(0, 1 - fadeProgress);
      });
    }
  }

  /**
   * Update permute phase (batch-sequential: one batch at a time, each batch has parallel swaps)
   */
  updatePermutePhase(phaseTime) {
    // If no active swaps, start the next batch
    if (this.activeSwaps.length === 0 && this.currentBatchIndex < this.swapBatches.length) {
      const batch = this.swapBatches[this.currentBatchIndex];
      for (const swapDef of batch) {
        this.startSwap(swapDef, phaseTime);
        // Each swap in the batch gets the batch's duration
        this.activeSwaps[this.activeSwaps.length - 1].duration = batch.duration;
      }
      this.currentBatchIndex++;
    }

    // Update all active swaps
    for (let i = this.activeSwaps.length - 1; i >= 0; i--) {
      const swap = this.activeSwaps[i];
      const elapsed = phaseTime - swap.actualStartTime;
      const progress = Math.min(1, elapsed / swap.duration);

      if (progress >= 1) {
        this.finalizeSwap(swap);
        this.activeSwaps.splice(i, 1);
      } else {
        const eased = this.easeInOutCubic(progress);
        const arcHeight = this.sackHeight * 0.8;
        const sackA = this.sacks[swap.indexA];
        const sackB = this.sacks[swap.indexB];

        // Interpolate X and Y, add arc offset
        const baseYA = swap.startYA + (swap.endYA - swap.startYA) * eased;
        const baseYB = swap.startYB + (swap.endYB - swap.startYB) * eased;

        sackA.renderX = swap.startXA + (swap.endXA - swap.startXA) * eased;
        sackA.renderY = baseYA - arcHeight * Math.sin(progress * Math.PI);

        sackB.renderX = swap.startXB + (swap.endXB - swap.startXB) * eased;
        sackB.renderY = baseYB + arcHeight * Math.sin(progress * Math.PI);
      }
    }
  }

  /**
   * Start visual swap animation of two sacks
   */
  startSwap(swapDef, currentTime) {
    const sackA = this.sacks[swapDef.from];
    const sackB = this.sacks[swapDef.to];

    this.activeSwaps.push({
      indexA: swapDef.from,
      indexB: swapDef.to,
      actualStartTime: currentTime,
      duration: swapDef.duration,
      startXA: sackA.renderX,
      startYA: sackA.renderY,
      startXB: sackB.renderX,
      startYB: sackB.renderY,
      endXA: sackB.renderX,   // Swap to B's position
      endYA: sackB.renderY,
      endXB: sackA.renderX,   // Swap to A's position
      endYB: sackA.renderY
    });
  }

  /**
   * Finalize visual swap - set to target positions
   */
  finalizeSwap(swap) {
    const sackA = this.sacks[swap.indexA];
    const sackB = this.sacks[swap.indexB];

    sackA.renderX = swap.endXA;
    sackA.renderY = swap.endYA;
    sackB.renderX = swap.endXB;
    sackB.renderY = swap.endYB;
  }

  /**
   * Update select phase (move to board)
   * Simplified for large overlay: just interpolate within single coordinate space
   */
  updateSelectPhase(phaseTime) {
    const progress = Math.min(1, phaseTime / this.phaseDuration);
    const eased = this.easeInOutCubic(progress);

    // Simple interpolation in overlay coordinates
    this.sacks.forEach(sack => {
      if (sack.currentlySelecting && sack.targetX !== undefined) {
        sack.renderX = sack.selectStartX + (sack.targetX - sack.selectStartX) * eased;
        sack.renderY = sack.selectStartY + (sack.targetY - sack.selectStartY) * eased;
      }
    });

    // When complete, mark as done
    if (progress >= 1) {
      this.sacks.forEach(sack => {
        if (sack.currentlySelecting) {
          sack.currentlySelecting = false;
        }
      });
    }
  }

  /**
   * Update cleanup phase (move off-screen to the right)
   */
  updateCleanupPhase(phaseTime) {
    const progress = Math.min(1, phaseTime / this.phaseDuration);
    const eased = this.easeInOutCubic(progress);

    let cleaningCount = 0;
    this.sacks.forEach(sack => {
      if (sack.cleaningUp) {
        cleaningCount++;
        const startX = sack.cleanupStartX; // Use captured start position
        sack.renderX = startX + (sack.targetX - startX) * eased;
      }
    });

    if (cleaningCount > 0 && phaseTime < 100) {
    }
  }

  /**
   * Advance to next phase or instruction
   */
  advanceToNextPhase() {
    const group = this.listGroups[this.currentGroupIndex];

    if (this.currentPhase === 'permute') {
      // After permute phase, randomly shuffle distributions
      this.shuffleDistributions();
    }

    if (this.currentPhase === 'cleanup') {
      // Remove cleaned up sacks
      this.sacks = this.sacks.filter(s => !s.cleaningUp);

      // Move to next group
      this.currentGroupIndex++;
      this.startNextGroup();
    } else {
      // Move to next instruction in current group
      this.currentInstructionIndex++;
      this.startNextInstruction(group);
    }
  }

  /**
   * Randomly shuffle distributions among sacks (after visual animation)
   * This is the ACTUAL shuffle that determines which hypothesis each sack has
   */
  shuffleDistributions() {
    if (!this.currentListSackIndices || !this.distributionsToShuffle) return;

    const n = this.distributionsToShuffle.length;
    if (n <= 1) return;

    // Fisher-Yates shuffle of distributions
    const shuffled = [...this.distributionsToShuffle];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Sort sacks by visual position (renderX) to determine left-to-right order
    const sortedIndices = [...this.currentListSackIndices].sort((a, b) => {
      return this.sacks[a].renderX - this.sacks[b].renderX;
    });

    // Assign shuffled distributions based on visual position order
    // Leftmost sack gets shuffled[0], etc.
    sortedIndices.forEach((sackIdx, visualPosition) => {
      this.sacks[sackIdx].distribution = shuffled[visualPosition];
      this.sacks[sackIdx].currentIndex = visualPosition; // Update currentIndex to match visual position
    });

    this.distributionsToShuffle = null;
  }

  /**
   * Render animation frame
   */
  render() {
    // Clear entire overlay canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Don't render board components - they stay on the background board canvas
    // Only render sacks on the overlay

    // Render all sacks (in animation area or board area)
    this.sacks.forEach(sack => {
      this.renderSack(sack);
    });
  }

  /**
   * Render sack to a specific canvas context at given position
   */
  renderSackToCanvas(ctx, x, y, sack) {
    const renderer = window.SackRenderer;
    const fillColor = sack.color || (renderer?.DEFAULT_COLOR || '#B8A090');

    // Determine if we should show contents
    const showContents = sack.distribution && sack.showLabel && sack.labelAlpha > 0;
    const alpha = sack.labelAlpha || 1.0;

    if (renderer) {
      // Use shared renderer
      renderer.renderSack(ctx, x, y, this.sackWidth, this.sackHeight, {
        fillColor,
        contents: sack.distribution,
        showContents,
        alpha
      });
    } else {
      // Fallback: basic sack rendering
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + this.sackHeight);
      ctx.lineTo(x + this.sackWidth, y + this.sackHeight);
      ctx.lineTo(x + this.sackWidth, y);
      ctx.stroke();
      ctx.fill();
    }
  }

  /**
   * Render single sack
   */
  renderSack(sack) {
    const x = sack.renderX !== undefined ? sack.renderX : sack.x;
    const y = sack.renderY !== undefined ? sack.renderY : sack.y;

    // Use the shared rendering method
    this.renderSackToCanvas(this.ctx, x, y, sack);
  }

  /**
   * Easing function
   */
  easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Check if animation is complete
   */
  isDone() {
    return this.isComplete;
  }
}

// Export for use in game
if (typeof window !== 'undefined') {
  window.AnimationPlayer = AnimationPlayer;
}
