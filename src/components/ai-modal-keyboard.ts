type KeyboardEventKey = {
  key: string
}

export const shouldCloseAiModalOnKeydown = (
  event: KeyboardEventKey,
  isNestedPopupOpen: boolean,
): boolean => event.key === 'Escape' && !isNestedPopupOpen
