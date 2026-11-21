import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

export default function SavedScreen() {
  return (
    <Screen title="Saved" subtitle="Places you want to go, and places you've been">
      <EmptyState
        icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
        title="No saved places yet"
        body="Saved places show up here. You'll be able to filter them, check off the ones you've visited, and choose who can see each one."
      />
    </Screen>
  );
}
