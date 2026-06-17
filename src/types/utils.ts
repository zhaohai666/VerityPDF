import type { Annotation, ArrowAnnotation, LineAnnotation, FreehandAnnotation } from './annotation';
import type { Point } from './common';

export function hasEndPoint(annotation: Annotation): annotation is ArrowAnnotation | LineAnnotation {
  return annotation.type === 'arrow' || annotation.type === 'line';
}

export function isArrowAnnotation(annotation: Annotation): annotation is ArrowAnnotation {
  return annotation.type === 'arrow';
}

export function isLineAnnotation(annotation: Annotation): annotation is LineAnnotation {
  return annotation.type === 'line';
}

export function isFreehandAnnotation(annotation: Annotation): annotation is FreehandAnnotation {
  return annotation.type === 'freehand';
}

export function isValidPoint(point: unknown): point is Point {
  return typeof point === 'object' && point !== null && 'x' in point && 'y' in point;
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}