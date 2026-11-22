"""Clear the scan candidates cache.

The grid changed from 0.001-degree cells to 0.0005-degree cells, and nearby
search now only asks Google for photographable place types. Old entries use
the old keys and were filled by the unfiltered search, so drop them all; each
cell refetches on its next scan. Place rows are kept (cards, saves and
interests point at them).
"""

from django.db import migrations


def clear_nearby_cache(apps, schema_editor):
    apps.get_model('app', 'NearbySearchCache').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0007_saved_marked_visited_at'),
    ]

    operations = [
        migrations.RunPython(clear_nearby_cache, migrations.RunPython.noop),
    ]
