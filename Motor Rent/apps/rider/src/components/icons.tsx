import Svg, { Circle, Path } from 'react-native-svg';

type P = { size?: number; color: string; width?: number };

export function MenuIcon({ size = 22, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
      <Path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CloseIcon({ size = 20, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function UserIcon({ size = 22, color, width = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9.5} />
      <Circle cx={12} cy={10} r={3.2} />
      <Path d="M6.2 18.4c1.3-2.2 3.4-3.4 5.8-3.4s4.5 1.2 5.8 3.4" />
    </Svg>
  );
}

export function ArrowRightIcon({ size = 18, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 18, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function ArrowLeftIcon({ size = 18, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  );
}
