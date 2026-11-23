/** Extra checks for cars, done with the rider at pickup and again at return. */
export const CAR_CHECKS = [
  { key: "spare_tyre", label: "Spare tyre" }, { key: "jack_tools", label: "Jack and wheel brace" },
  { key: "triangle", label: "Warning triangle" }, { key: "papers", label: "Registration and insurance papers" },
  { key: "warning_lights", label: "No dashboard warning lights" }, { key: "ac", label: "Air conditioning works" },
  { key: "interior", label: "Interior clean, no damage" }, { key: "keys", label: "Key and key fob" },
] as const;
