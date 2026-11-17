"""addons batch 5 (Glow): Collab Canvas, Creator Office Hours, Fan Missions, Moodboard Pins, Time-Lock Polls, Thank-You Stories

Revision ID: e2b0c0d0a005
Revises: e2b0c0d0a004
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2b0c0d0a005'
down_revision: Union[str, Sequence[str], None] = 'e2b0c0d0a004'
branch_labels = None
depends_on = None

def _u(col='user_id', nullable=False, ondelete='CASCADE', pk=False):
    return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete=ondelete), nullable=nullable, index=not pk, primary_key=pk)
def _id(): return sa.Column('id', sa.String(40), primary_key=True)
def _at(): return sa.Column('at', sa.BigInteger(), nullable=False, index=True)

def upgrade() -> None:
    op.create_table('b5_canvases', _id(), _u('owner_id'), sa.Column('title', sa.String(80), nullable=False), sa.Column('coauthors', sa.JSON(), nullable=True),
                    sa.Column('tiles', sa.JSON(), nullable=True), sa.Column('locked', sa.Boolean(), nullable=False, server_default=sa.false()), _at())
    op.create_table('b5_office_slots', _id(), _u('creator_id'), sa.Column('starts_at', sa.BigInteger(), nullable=False, index=True),
                    sa.Column('minutes', sa.Integer(), nullable=False), sa.Column('topic', sa.String(120), nullable=False, server_default=''),
                    _u('booked_by', nullable=True, ondelete='SET NULL'), sa.Column('status', sa.String(10), nullable=False, server_default='open'), _at())
    op.create_table('b5_missions', _id(), _u('creator_id'), sa.Column('title', sa.String(80), nullable=False), sa.Column('detail', sa.String(500), nullable=False, server_default=''),
                    sa.Column('points', sa.Integer(), nullable=False), sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()), _at())
    op.create_table('b5_mission_claims', _id(), sa.Column('mission_id', sa.String(40), sa.ForeignKey('b5_missions.id', ondelete='CASCADE'), nullable=False, index=True),
                    _u('fan_id'), sa.Column('proof', sa.String(500), nullable=False), sa.Column('status', sa.String(10), nullable=False, server_default='pending'),
                    _at(), sa.Column('decided_at', sa.BigInteger(), nullable=True), sa.UniqueConstraint('mission_id', 'fan_id', name='uq_b5_claim_mission_fan'))
    op.create_table('b5_moodboards', _id(), _u('owner_id'), sa.Column('name', sa.String(60), nullable=False),
                    sa.Column('public', sa.Boolean(), nullable=False, server_default=sa.false()), _at())
    op.create_table('b5_moodboard_pins', _id(), sa.Column('board_id', sa.String(40), sa.ForeignKey('b5_moodboards.id', ondelete='CASCADE'), nullable=False, index=True),
                    sa.Column('media_url', sa.String(200), nullable=True), sa.Column('note', sa.String(300), nullable=False, server_default=''), _at())
    op.create_table('b5_polls', _id(), _u('creator_id'), sa.Column('question', sa.String(200), nullable=False), sa.Column('options', sa.JSON(), nullable=False),
                    sa.Column('reveal_at', sa.BigInteger(), nullable=False, index=True), _at())
    op.create_table('b5_poll_votes', sa.Column('poll_id', sa.String(40), sa.ForeignKey('b5_polls.id', ondelete='CASCADE'), primary_key=True), _u(pk=True),
                    sa.Column('choice', sa.Integer(), nullable=False), sa.Column('at', sa.BigInteger(), nullable=False))
    op.create_table('b5_thanks', _id(), _u('author_id'), _u('subject_id'), sa.Column('text', sa.String(600), nullable=False),
                    sa.Column('context', sa.String(20), nullable=False, server_default='help'),
                    sa.Column('status', sa.String(10), nullable=False, server_default='pending', index=True), _at())

def downgrade() -> None:
    for t in ('b5_thanks', 'b5_poll_votes', 'b5_polls', 'b5_moodboard_pins', 'b5_moodboards', 'b5_mission_claims', 'b5_missions', 'b5_office_slots', 'b5_canvases'):
        op.drop_table(t)
