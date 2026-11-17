"""mood media (photo/video Moods)

Revision ID: a7c1d2e3f4b5
Revises: 1e57b9884649
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a7c1d2e3f4b5'
down_revision: Union[str, Sequence[str], None] = '1e57b9884649'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('statuses', sa.Column('media', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('statuses', 'media')
