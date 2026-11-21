import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old bike links open the step-by-step booking with that bike pre-selected. */
export default function BikeRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/book', params: id ? { bike: id } : {} }} />;
}
