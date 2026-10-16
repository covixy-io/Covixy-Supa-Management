export function capacity(input: {
  serverRamMb: number;
  reserveMb: number;
  stackRamMb: number;
  activeStacks: number;
}) {
  const usedMb = input.activeStacks * input.stackRamMb;
  const availableMb = input.serverRamMb - input.reserveMb;
  const freeMb = availableMb - usedMb;
  return {
    usedMb,
    availableMb,
    freeMb,
    canCreate: freeMb >= input.stackRamMb,
    fits: Math.max(0, Math.floor(availableMb / input.stackRamMb)),
  };
}
