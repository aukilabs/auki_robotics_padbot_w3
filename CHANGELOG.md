# Changelog Rules

## Format
- Use Markdown format
- Each entry should be dated (YYYY-MM-DD or full timestamp)
- Group changes by date
- Use clear, descriptive headings

## Required Sections
1. **Changes Made**
   - List specific changes
   - Use bullet points for details
   - Include code-level changes (variables, functions, etc.)
2. **Key Benefits**
   - List the main improvements
   - Focus on user experience and system behavior
3. **Technical Details**
   - Include timing values
   - List state variables
   - Document cleanup procedures
4. **Files Modified**
   - List all affected files
   - Include full paths
5. **Next Steps**
   - List planned improvements
   - Note areas for monitoring
   - Document potential issues to watch

## Process
- Update changelog before applying changes
- Include changelog updates in approval requests
- Keep entries concise but informative
- Link related changes across entries

## Location
- Store in root directory as `CHANGELOG.md`
- Keep chronological order (newest first)
- Maintain consistent formatting

---

# Patrol System Changes

## 2025-05-30T18:40:19+0800: Patrol Resume & Navigation Status Improvements

### Changes Made
- Added an effect hook to automatically resume patrol when navigation status changes to `IDLE`.
- Improved patrol interruption handling:
  - Patrol now resumes from the current point after interruptions.
  - Patrol state is preserved and only resumes if still active and paused.
- Refactored navigation and patrol state management for reliability.
- Updated `restartPromotion` and `navigateToNextPoint` logic to ensure patrol continuity.
- Enhanced debug logging for patrol and navigation transitions.

### Key Benefits
- More robust and automatic patrol resumption after interruptions.
- Smoother user experience with less manual intervention required.
- Improved reliability and maintainability of patrol logic.

### Technical Details
- Effect hook monitors `navigationStatus` and triggers patrol resume after a 2-second delay if paused.
- State variables: `isPatrollingRef`, `isPatrolPausedRef`, `navigationStatus`, `promotionActive`, `promotionCancelled`, `currentPointIndex`.
- Cleanup: Effect hook cleans up timers and only resumes if component is still mounted and patrol is active.

### Files Modified
- `RobotGUI/src/gotu/screens/MainScreen.tsx`
- `RobotGUI/src/cactus/screens/MainScreen.tsx`

### Next Steps
- Monitor patrol resumption for edge cases or missed resumes.
- Consider adding user feedback/notification when patrol is auto-resumed.
- Review and optimize timing values for different robot states.

## 2024-03-21: Touch Interaction and Patrol Pause Implementation

### Changes Made
1. **Patrol Pause Mechanism**
   - Added new state variables:
     - `isPatrolPaused` and `isPatrolPausedRef` to track paused state
     - `isTouchInteraction` and `touchInteractionTimeoutRef` for touch handling
   - Implemented `pausePatrol()` and `resumePatrol()` functions
   - Modified `handleGoHome()` to pause instead of cancel patrol

2. **Touch Interaction Handling**
   - Added 10-second timeout for destination selection during patrol
   - When touching during patrol:
     - Patrol is immediately paused
     - User has 10 seconds to select a destination
     - If no selection is made, patrol automatically resumes
   - When touching outside patrol:
     - 20-second inactivity timer starts for auto-patrol

3. **Navigation Status Management**
   - Added effect to resume patrol after interruption
   - Patrol resumes when navigation status changes to IDLE
   - Added cleanup for touch interaction timeout

### Key Benefits
- Patrol can now be paused instead of cancelled
- Smoother transition between patrol and destination selection
- Automatic resume after interruption
- Better user experience with clear timeout periods

### Technical Details
- Touch timeout: 10 seconds (10000ms)
- Inactivity timer: 20 seconds (20000ms)
- Patrol state is preserved during pauses
- Automatic cleanup of timeouts on component unmount

### Files Modified
- `RobotGUI/src/gotu/screens/MainScreen.tsx`

### Next Steps
- Monitor the effectiveness of the 10-second timeout
- Consider adding visual feedback during the timeout period
- Evaluate if additional error handling is needed for edge cases 

## 2025-05-30T10:42:02.578Z: Patrol Cancellation Issue on Pause

### Changes Made
- Identified an issue where patrol was cancelled instead of paused when no destination was selected.
- Logs indicate that the patrol sequence was paused, but the waypoint sequence was cancelled, and patrol state changed to inactive.
- Robot movement stopped and auto-promotion was disabled, indicating an unintended cancellation.

### Key Benefits
- Improved understanding of patrol state transitions.
- Ensures patrol can be paused without cancellation when no destination is selected.

### Technical Details
- Timestamp: 2025-05-30T10:42:02.578Z
- Logs show:
  - "Pausing patrol sequence"
  - "Waypoint sequence cancelled"
  - "Patrol state changed to: inactive"
  - "Patrol paused for destination selection"
  - "Robot movement stopped"
  - "Auto-promotion disabled, not starting inactivity timer"
  - "Navigation state changed to: IDLE"
  - "Polling stopped in IDLE state"

### Files Modified
- No files modified yet; investigation ongoing.

### Next Steps
- Investigate the logic in `handleGoHome` and related functions to ensure patrol is paused, not cancelled, when no destination is selected.
- Add additional logging to clarify state transitions during pause and resume.
- Consider adding a user notification when patrol is paused without a destination.

### Note
- The code was not successful in pausing patrol without cancellation. Further investigation is required to resolve this issue. 