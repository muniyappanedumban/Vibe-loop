"""addons batch 2 (Glow): Vibe Meter, Streak Garden, Micro Challenges, Spotlight Wall, Hot Take Duels, Gratitude Jar

Revision ID: e2b0c0d0a002
Revises: d4f6b8c0e2a5
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2b0c0d0a002'
down_revision: Union[str, Sequence[str], None] = 'd4f6b8c0e2a5'
branch_labels = None
depends_on = None

def _u(col='user_id', unique=False): return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True, unique=unique)
def _id(): return sa.Column('id', sa.String(40), primary_key=True)
def _at(): return sa.Column('at', sa.BigInteger(), nullable=False, index=True)

def upgrade() -> None:
    op.create_table('b2_vibe_votes', _id(), sa.Column('post_id', sa.String(40), nullable=False, index=True), _u(), sa.Column('value', sa.Integer(), nullable=False), _at(),
                    sa.UniqueConstraint('post_id', 'user_id', name='uq_b2_vibe_post_user'))
    op.create_table('b2_streak_freezes', _id(), _u(), sa.Column('day', sa.String(10), nullable=False), _at(), sa.UniqueConstraint('user_id', 'day', name='uq_b2_freeze_user_day'))
    op.create_table('b2_challenges', _id(), sa.Column('title', sa.String(80), nullable=False), sa.Column('rules', sa.Text(), nullable=False),
                    sa.Column('ends_at', sa.BigInteger(), nullable=False, index=True), sa.Column('created_by', sa.String(60), nullable=False, server_default=''), _at())
    op.create_table('b2_challenge_entries', _id(), sa.Column('challenge_id', sa.String(40), sa.ForeignKey('b2_challenges.id', ondelete='CASCADE'), nullable=False, index=True), _u(),
                    sa.Column('text', sa.String(500), nullable=False), sa.Column('media_url', sa.String(200), nullable=True), sa.Column('votes', sa.JSON(), nullable=False), _at(),
                    sa.UniqueConstraint('challenge_id', 'user_id', name='uq_b2_entry_challenge_user'))
    op.create_table('b2_spotlights', _id(), _u(unique=True), sa.Column('reason', sa.String(200), nullable=False), sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
                    sa.Column('added_by', sa.String(60), nullable=False, server_default=''), _at())
    op.create_table('b2_duels', _id(), _u('author_id'), sa.Column('statement', sa.String(200), nullable=False), sa.Column('side_a', sa.String(40), nullable=False),
                    sa.Column('side_b', sa.String(40), nullable=False), _at())
    op.create_table('b2_duel_takes', _id(), sa.Column('duel_id', sa.String(40), sa.ForeignKey('b2_duels.id', ondelete='CASCADE'), nullable=False, index=True), _u(),
                    sa.Column('side', sa.String(1), nullable=False), sa.Column('argument', sa.String(140), nullable=False), sa.Column('backers', sa.JSON(), nullable=False), _at(),
                    sa.UniqueConstraint('duel_id', 'user_id', name='uq_b2_take_duel_user'))
    op.create_table('b2_gratitude_notes', _id(), _u(), sa.Column('day', sa.String(10), nullable=False), sa.Column('text', sa.String(300), nullable=False), _at())
    op.create_index('ix_b2_gratitude_user_day', 'b2_gratitude_notes', ['user_id', 'day'])

def downgrade() -> None:
    op.drop_index('ix_b2_gratitude_user_day', table_name='b2_gratitude_notes')
    for t in ('b2_gratitude_notes', 'b2_duel_takes', 'b2_duels', 'b2_spotlights', 'b2_challenge_entries', 'b2_challenges', 'b2_streak_freezes', 'b2_vibe_votes'): op.drop_table(t)
