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

export function ChevronDownIcon({ size = 18, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function ArrowDownIcon({ size = 18, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  );
}

export function PinIcon({ size = 20, color, width = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <Circle cx={12} cy={9.5} r={2.6} />
    </Svg>
  );
}

export function ClockIcon({ size = 20, color, width = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function PlusIcon({ size = 18, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function MinusIcon({ size = 18, color, width = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
      <Path d="M5 12h14" />
    </Svg>
  );
}

export function ShieldIcon({ size = 20, color, width = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z" />
    </Svg>
  );
}

export function HomeIcon({ size = 22, color, width = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

export function BikeIcon({ size = 22, color, width = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={5.5} cy={16.5} r={3.5} />
      <Circle cx={18.5} cy={16.5} r={3.5} />
      <Path d="M5.5 16.5 9 9h4l3 7.5M9 9H7M13 9l1.5-2H17" />
    </Svg>
  );
}

export function CalendarIcon({ size = 22, color, width = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    </Svg>
  );
}
