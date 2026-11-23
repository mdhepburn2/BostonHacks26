import { Redirect } from 'expo-router';

/** The web app has no camera scan; anyone who lands here goes to Search. */
export default function ScanScreen() {
  return <Redirect href="/search" />;
}
