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
    this.rowY = cellSize * 1.5; // Position in top portion, leaving room above
    // Use shared renderer dimensions if available
    const renderer = window.SackRenderer;
    this.sackWidth = cellSize * (renderer?.SACK_WIDTH_RATIO || 0.8);
    this.sackHeight = cellSize * (renderer?.SACK_HEIGHT_RATIO || 0.85);
    this.sackSpacing = cellSize * 0.2;

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
    this.swapAnimations = [];
    this.currentSwapIndex = 0;
    this.swapStartTime = 0;
    this.swapsPerSecond = 2;

    // Callbacks
    this.onComplete = null;

    this.groupInstructionsByList();
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
    const startX = (this.canvas.width - (distributions.length * (this.sackWidth + this.sackSpacing) - this.sackSpacing)) / 2;

    // Create new sacks for this list
    const listColor = this.listColorMap.get(instruction.listId) || '#D4A574'; // Default to brown
    const newSacks = distributions.map((dist, i) => {
      const xPos = startX + i * (this.sackWidth + this.sackSpacing);
      return {
        listId: instruction.listId,
        originalIndex: i,
        currentIndex: i,
        x: xPos,
        y: this.rowY,
        renderX: -this.sackWidth - 20,  // Start off-screen left
        renderY: this.rowY,
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
    const startX = (this.canvas.width - (n * (this.sackWidth + this.sackSpacing) - this.sackSpacing)) / 2;
    currentListSackIndices.forEach((idx, position) => {
      this.sacks[idx].x = startX + position * (this.sackWidth + this.sackSpacing);
      this.sacks[idx].renderX = this.sacks[idx].x;
      this.sacks[idx].renderY = this.rowY;
    });

    // Store distributions for shuffling after animation
    this.distributionsToShuffle = currentListSackIndices.map(idx => this.sacks[idx].distribution);

    // Generate visual swap sequence (Fisher-Yates + random swaps)
    this.generateVisualSwapSequence(currentListSackIndices);

    // Set phase duration based on swap timings
    if (this.swapAnimations.length > 0) {
      const lastSwap = this.swapAnimations[this.swapAnimations.length - 1];
      this.phaseDuration = lastSwap.startTime + lastSwap.duration + 100;
    } else {
      this.phaseDuration = 1000;
    }

    this.currentSwapIndex = 0;
    this.currentSwap = null;

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
      this.swapAnimations = [];
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

    // Assign timing to swaps (variable speed)
    const speeds = [0.5, 1, 1.5, 2, 1.5, 1];
    const durations = speeds.map(s => 500 / s);
    const totalSwaps = swaps.length;
    const totalSpeedWeight = speeds.reduce((a, b) => a + b);

    let timeAccum = 0;
    let swapsAssigned = 0;

    speeds.forEach((speed, segmentIdx) => {
      const swapsInSegment = segmentIdx === speeds.length - 1
        ? totalSwaps - swapsAssigned
        : Math.floor((totalSwaps / totalSpeedWeight) * speed);

      const swapDuration = durations[segmentIdx];

      for (let i = 0; i < swapsInSegment && swapsAssigned < totalSwaps; i++) {
        swaps[swapsAssigned].startTime = timeAccum;
        swaps[swapsAssigned].duration = swapDuration;
        timeAccum += swapDuration;
        swapsAssigned++;
      }
    });

    this.swapAnimations = swaps;
  }

  /**
   * Select phase: Move selected sack to board
   */
  startSelectPhase(instruction) {
    this.currentPhase = 'select';
    this.phaseDuration = 1000; // 1 second per selection

    console.warn(`[Animation] SELECT: Looking for listId=${instruction.listId}, index=${instruction.index}, templateId=${instruction.templateId}`);
    console.warn(`[Animation] Current sacks:`, this.sacks.map(s => ({
      listId: s.listId,
      currentIndex: s.currentIndex,
      selected: s.selected,
      renderX: s.renderX,
      renderY: s.renderY
    })));

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

    console.warn(`[Animation] Found sack:`, {listId: sack.listId, currentIndex: sack.currentIndex, renderX: sack.renderX, renderY: sack.renderY});

    if (sack) {
      sack.selected = true;
      sack.currentlySelecting = true; // Mark as the sack being moved RIGHT NOW
      sack.targetComponentId = instruction.templateId;
      // Use actual visual position after permutation, not logical position
      sack.selectStartX = sack.renderX !== undefined ? sack.renderX : sack.x;
      sack.selectStartY = sack.renderY !== undefined ? sack.renderY : this.rowY;

      console.warn(`[Animation] Select start position: (${sack.selectStartX}, ${sack.selectStartY})`);

      // Find target position on board
      const component = this.level.components.find(c => c.params.linkedTemplate === instruction.templateId);
      if (component) {
        // Convert grid coordinates to overlay pixel coordinates using coordinate system
        const overlayPos = this.coords.gridToOverlayPixel(
          component.position.x,
          component.position.y
        );

        // Center sack in cell
        sack.targetX = overlayPos.x + (this.cellSize - this.sackWidth) / 2;
        sack.targetY = overlayPos.y + (this.cellSize - this.sackHeight) / 2;

        console.warn(`[Animation] Target position: (${sack.targetX}, ${sack.targetY})`);
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
    console.log(`[Cleanup] Starting cleanup phase. Total sacks: ${this.sacks.length}, Unselected: ${unselectedSacks.length}, phaseStartTime: ${this.phaseStartTime}`);

    this.sacks.forEach((sack, i) => {
      if (!sack.selected) {
        sack.cleaningUp = true;
        sack.cleanupStartX = sack.renderX; // Capture current render position
        sack.targetX = this.canvas.width + 100; // Off-screen right
        sack.targetY = this.rowY;
        console.log(`[Cleanup] Marking sack ${i} for cleanup. StartX: ${sack.cleanupStartX}, TargetX: ${sack.targetX}`);
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
      console.log(`[Cleanup] Update called: currentPhase=${this.currentPhase}, phaseTime=${phaseTime.toFixed(0)}ms`);
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
      // For permute phase, check if all swaps are done, not just time
      const allSwapsProcessed = this.currentSwapIndex >= this.swapAnimations.length;
      const noActiveSwap = this.currentSwap === null;
      return allSwapsProcessed && noActiveSwap;
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
   * Update permute phase (one swap at a time with variable duration)
   */
  updatePermutePhase(phaseTime) {
    // Check if we need to start a new swap
    if (!this.currentSwap && this.currentSwapIndex < this.swapAnimations.length) {
      const swapDef = this.swapAnimations[this.currentSwapIndex];

      // Check if it's time to start this swap
      if (phaseTime >= swapDef.startTime) {
        this.startSwap(swapDef, phaseTime);
      }
    }

    // Update current swap if active
    if (this.currentSwap) {
      const elapsed = phaseTime - this.currentSwap.actualStartTime;
      const progress = Math.min(1, elapsed / this.currentSwap.duration);

      if (progress >= 1) {
        // Swap complete
        this.finalizeSwap();
        this.currentSwapIndex++;
        this.currentSwap = null;
      } else {
        // Update animated positions
        const eased = this.easeInOutCubic(progress);

        // Arc motion: one goes up, one goes down
        const arcHeight = this.sackHeight * 1.5;
        const sackA = this.sacks[this.currentSwap.indexA];
        const sackB = this.sacks[this.currentSwap.indexB];

        sackA.renderX = this.currentSwap.startXA + (this.currentSwap.endXA - this.currentSwap.startXA) * eased;
        sackA.renderY = this.rowY - arcHeight * Math.sin(progress * Math.PI);

        sackB.renderX = this.currentSwap.startXB + (this.currentSwap.endXB - this.currentSwap.startXB) * eased;
        sackB.renderY = this.rowY + arcHeight * Math.sin(progress * Math.PI);
      }
    }
  }

  /**
   * Start visual swap animation of two sacks
   */
  startSwap(swapDef, currentTime) {
    const sackA = this.sacks[swapDef.from];
    const sackB = this.sacks[swapDef.to];

    this.currentSwap = {
      indexA: swapDef.from,
      indexB: swapDef.to,
      actualStartTime: currentTime,
      duration: swapDef.duration,
      startXA: sackA.renderX,
      startXB: sackB.renderX,
      endXA: sackB.renderX,  // Swap to B's position
      endXB: sackA.renderX   // Swap to A's position
    };
  }

  /**
   * Finalize visual swap - set to target positions
   */
  finalizeSwap() {
    const swap = this.currentSwap;
    const sackA = this.sacks[swap.indexA];
    const sackB = this.sacks[swap.indexB];

    // Set to exact target positions (not current values)
    // This prevents drift at high speeds where animation might not reach exactly progress=1.0
    sackA.renderX = swap.endXA;
    sackB.renderX = swap.endXB;

    // Reset Y
    sackA.renderY = this.rowY;
    sackB.renderY = this.rowY;
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
        sack.renderY = this.rowY;
      }
    });

    if (cleaningCount > 0 && phaseTime < 100) {
      console.log(`[Cleanup] Update: phaseTime=${phaseTime.toFixed(0)}ms, progress=${progress.toFixed(2)}, cleaning ${cleaningCount} sacks`);
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
