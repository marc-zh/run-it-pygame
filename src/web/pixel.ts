export function layoutStage(frame: HTMLElement, stage: HTMLElement): void {
  const s = Math.min(frame.clientWidth / 500, frame.clientHeight / 800);
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${Math.floor((frame.clientWidth - 500 * s) / 2)}px`;
  stage.style.top = `${Math.floor((frame.clientHeight - 800 * s) / 2)}px`;
}
