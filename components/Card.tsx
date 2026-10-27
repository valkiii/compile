/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { PlayedCard } from "../types";
import { cardArtUrl } from "../data/cardArt";
import { protocolColor } from "../utils/protocolColors";
import { protocolStyle } from "../utils/protocolStyle";

interface CardProps {
  card: PlayedCard;
  onPointerDown?: (event: React.PointerEvent) => void;
  onClick?: (event: React.MouseEvent) => void;
  onPointerEnter?: (event: React.PointerEvent) => void;
  onPointerLeave?: (event: React.PointerEvent) => void;
  isFaceUp: boolean;
  faceDownValue?: number;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isTargetable?: boolean;
  isSourceOfEffect?: boolean;
  style?: React.CSSProperties;
  additionalClassName?: string;
}

// FIX: Changed component to React.FC to correctly handle React-specific props like 'key'.
export const CardComponent: React.FC<CardProps> = ({
  card,
  onPointerDown,
  onClick,
  onPointerEnter,
  onPointerLeave,
  isFaceUp,
  faceDownValue = 2,
  isSelected,
  isMultiSelected,
  isTargetable,
  isSourceOfEffect,
  style,
  additionalClassName,
}) => {
  // Helper to strip HTML tags for text length calculation
  const getTextLength = (html: string): number => {
    const stripped = html.replace(/<[^>]*>/g, "");
    return stripped.length;
  };

  const RuleBox = ({
    content,
    className,
  }: {
    content: string;
    className?: string;
  }) => {
    // Guard against undefined/null content
    if (!content) {
      return <div className={`card-rule-box ${className || ""}`} />;
    }
    // Add size classes if content is too long for the box
    // Each line fits ~25 characters, boxes fit ~3-4 lines comfortably
    const textLength = getTextLength(content);
    const isLongText = textLength > 95; // >3 lines
    const isVeryLongText = textLength > 140; // >4-5 lines
    const sizeClass = isVeryLongText
      ? "very-long-text"
      : isLongText
      ? "long-text"
      : "";
    return (
      <div
        className={`card-rule-box ${className || ""} ${sizeClass}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  };

  const classNames = ["card-component"];
  if (card.protocol) {
    classNames.push(`card-protocol-${card.protocol.toLowerCase()}`);
  }
  // Cards dealt into a game don't carry their protocol colour: look it up by name
  const color = card.color || protocolColor(card.protocol);
  if (color) {
    classNames.push("has-custom-color");
  }
  // Each protocol has its own motif + symbol so similar colours are still told apart
  const identity = protocolStyle(card.protocol);
  if (identity) {
    classNames.push("has-motif", `motif-${identity.motif}`);
  } else if (card.pattern) {
    classNames.push(`card-pattern-${card.pattern}`);
  }
  if (isSelected) classNames.push("selected");
  if (isMultiSelected) classNames.push("multi-selected");
  if (isTargetable) classNames.push("is-targetable");
  if (isSourceOfEffect) classNames.push("is-source-of-effect");
  if (additionalClassName) classNames.push(additionalClassName);

  // Create inline styles for custom protocol colors
  const customStyle: React.CSSProperties = { ...style };
  if (color) {
    // Set CSS variable without quotes for proper color parsing
    (customStyle as any)["--card-custom-color"] = color;
  }
  if (identity) {
    (customStyle as any)["--card-accent"] = identity.accent;
    (customStyle as any)["--card-accent2"] = identity.accent2;
  }

  const artUrl = cardArtUrl(card.protocol, card.value);

  return (
    <div
      className={classNames.join(" ")}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      role="button"
      tabIndex={onPointerDown || onClick ? 0 : -1}
      style={customStyle}
    >
      <div className={`card-inner ${!isFaceUp ? "is-flipped" : ""}`}>
        <div className={`card-face card-front ${artUrl ? "has-art" : ""}`}>
          {artUrl && <div className="card-art" style={{ backgroundImage: `url(${artUrl})` }} aria-hidden="true" />}
          <div className="card-header">
            <span
              className={`card-protocol ${
                card.protocol.length <= 10 ? "short-protocol" : ""
              }`}
            >
              {identity && <span className="card-glyph-inline" aria-hidden="true">{identity.glyph}</span>}
              {card.protocol.slice(0, 10)}
            </span>
            <span className="card-value">{card.value}</span>
          </div>
          {identity && <span className="card-glyph-mark" aria-hidden="true">{identity.glyph}</span>}
          <div className="card-body">
            <RuleBox content={card.top} className="card-rule-top" />
            <RuleBox content={card.middle} className="card-rule-middle" />
            <RuleBox content={card.bottom} className="card-rule-bottom" />
          </div>
        </div>
        <div className="card-face card-back">
          <div className="card-back-value">{faceDownValue}</div>
        </div>
      </div>
    </div>
  );
};
