/**
 * Copyright (c) Nicolas Gallagher.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type { ViewProps } from '../View';

import debounce from 'debounce';
import StyleSheet from '../StyleSheet';
import View from '../View';
import React from 'react';

type Props = {
  ...ViewProps,
  onMomentumScrollBegin?: (e: any) => void,
  onMomentumScrollEnd?: (e: any) => void,
  onScroll?: (e: any) => void,
  onScrollBeginDrag?: (e: any) => void,
  onScrollEndDrag?: (e: any) => void,
  onTouchMove?: (e: any) => void,
  onWheel?: (e: any) => void,
  scrollEnabled?: boolean,
  scrollEventThrottle?: number,
  showsHorizontalScrollIndicator?: boolean,
  showsVerticalScrollIndicator?: boolean
};

const normalizeScrollEvent = e => ({
  nativeEvent: {
    contentOffset: {
      get x() {
        return e.target.scrollLeft;
      },
      get y() {
        return e.target.scrollTop;
      }
    },
    contentSize: {
      get height() {
        return e.target.scrollHeight;
      },
      get width() {
        return e.target.scrollWidth;
      }
    },
    layoutMeasurement: {
      get height() {
        return e.target.offsetHeight;
      },
      get width() {
        return e.target.offsetWidth;
      }
    }
  },
  timeStamp: Date.now()
});

/**
 * Encapsulates the Web-specific scroll throttling and disabling logic
 */
export default class ScrollViewBase extends React.Component<Props> {
  _viewRef: View;

  _debouncedOnScrollEnd = debounce(this._handleScrollEnd, 100);
  _state = { isScrolling: false, scrollLastTick: 0,
             isTouching: false, isTouchScrolling: false,
             wasTouchScrolling: false, didMomentumScrollStart: false };

  setNativeProps(props: Object) {
    if (this._viewRef) {
      this._viewRef.setNativeProps(props);
    }
  }

  render() {
    const {
      accessibilityLabel,
      accessibilityRelationship,
      accessibilityRole,
      accessibilityState,
      children,
      importantForAccessibility,
      nativeID,
      onLayout,
      pointerEvents,
      scrollEnabled = true,
      showsHorizontalScrollIndicator,
      showsVerticalScrollIndicator,
      style,
      testID
    } = this.props;

    const hideScrollbar =
      showsHorizontalScrollIndicator === false || showsVerticalScrollIndicator === false;
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRelationship={accessibilityRelationship}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
        children={children}
        importantForAccessibility={importantForAccessibility}
        nativeID={nativeID}
        onLayout={onLayout}
        onScroll={this._handleScroll}
        onTouchStart={this._handleTouchStart}
        onTouchEnd={this._handleTouchEnd}
        onTouchMove={this._createPreventableScrollHandler(this.props.onTouchMove)}
        onWheel={this._createPreventableScrollHandler(this.props.onWheel)}
        pointerEvents={pointerEvents}
        ref={this._setViewRef}
        style={[
          style,
          !scrollEnabled && styles.scrollDisabled,
          hideScrollbar && styles.hideScrollbar
        ]}
        testID={testID}
      />
    );
  }

  _createPreventableScrollHandler = (handler: Function) => {
    return (e: Object) => {
      if (this.props.scrollEnabled) {
        if (handler) {
          handler(e);
        }
      }
    };
  };

  _handleScroll = (e: Object) => {
    e.persist();
    e.stopPropagation();
    const { scrollEventThrottle = 0 } = this.props;
    // A scroll happened, so the scroll bumps the debounce.
    this._debouncedOnScrollEnd(e);
    if (this._state.isScrolling) {
      // Scroll last tick may have changed, check if we need to notify
      if (this._shouldEmitScrollEvent(this._state.scrollLastTick, scrollEventThrottle)) {
        this._handleScrollTick(e);
      }
    } else {
      // Weren't scrolling, so we must have just started
      this._handleScrollStart(e);
    }
    // If we continue getting scroll events after touch scrolling stopped,
    // assume momentum scrolling is ongoing
    if (this._state.wasTouchScrolling && !this._state.isTouchScrolling) {
      // Only send out start event once. Flag gets reset in handleScrollEnd.
      if (!this._state.didMomentumScrollStart) {
        const { onMomentumScrollStart } = this.props;
        if (onMomentumScrollStart) {
          onMomentumScrollStart();
        }
        this._state.didMomentumScrollStart = true;
      }
    }
  };

  _handleTouchEnd = (e: Object) => {
    const { onScrollEndDrag } = this.props;
    if(this._state.isTouchScrolling) {
      if (onScrollEndDrag) {
        onScrollEndDrag();
      }
    }
    this._state.isTouching = false;
    this._state.isTouchScrolling = false;
  };

  _handleTouchStart = (e: Object) => {
    this._state.isTouching = true;
  };

  _handleScrollStart(e: Object) {
    this._state.isScrolling = true;
    this._state.scrollLastTick = Date.now();
    if (this._state.isTouching) {
      this._state.isTouchScrolling = true;
      this._state.wasTouchScrolling = true;
      this._state.didMomentumScrollStart = false;
      if (this.props.onScrollStartDrag) {
        this.props.onScrollStartDrag();
      }
    }
  }

  _handleScrollTick(e: Object) {
    const { onScroll } = this.props;
    this._state.scrollLastTick = Date.now();
    if (onScroll) {
      onScroll(normalizeScrollEvent(e));
    }
  }

  _handleScrollEnd(e: Object) {
    const { onScroll } = this.props;

    if (this._state.isTouchScrolling) {
      // Drag scrolling ongoing but not moving, which caused the debounce to
      // trigger a false 'end' event -> Igore it.
      return;
    }

    this._state.isScrolling = false;
    if (onScroll) {
      onScroll(normalizeScrollEvent(e));
    }

    if (this._state.wasTouchScrolling) {
      // Drag scrolling already stopped after touchEnd event (and onScrollEndDrag has already
      // been fired.) But momentum scrolling might have gone on for a while after this,
      // so check if we need to send out an end envent now.
      if (this._state.didMomentumScrollStart && this.props.onMomentumScrollEnd) {
        this.props.onMomentumScrollEnd();
      }
      // Clear touch scrolling related flags
      this._state.wasTouchScrolling = false;
      this._state.didMomentumScrollStart = false;
    }
    else {
      // Scroll was not combined with touch.
      // FIXME: Should drag events actually be fired in this scenario? Seems wrong but useful.
      if (this.props.onScrollEndDrag) {
        this.props.onScrollEndDrag();
      }
    }
  }

  _setViewRef = (element: View) => {
    this._viewRef = element;
  };

  _shouldEmitScrollEvent(lastTick: number, eventThrottle: number) {
    const timeSinceLastTick = Date.now() - lastTick;
    return eventThrottle > 0 && timeSinceLastTick >= eventThrottle;
  }
}

// Chrome doesn't support e.preventDefault in this case; touch-action must be
// used to disable scrolling.
// https://developers.google.com/web/updates/2017/01/scrolling-intervention
const styles = StyleSheet.create({
  scrollDisabled: {
    overflowX: 'hidden',
    overflowY: 'hidden',
    touchAction: 'none'
  },
  hideScrollbar: {
    scrollbarWidth: 'none'
  }
});
