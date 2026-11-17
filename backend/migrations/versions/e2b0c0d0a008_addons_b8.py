"""addons batch 8 (Hush): Emergency Card, Remind Them, Meeting Notes, Memory Jar, Kindness Streak, Quiet Reply

Revision ID: e2b0c0d0a008
Revises: e2b0c0d0a007
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2b0c0d0a008'
down_revision: Union[str, Sequence[str], None] = 'e2b0c0d0a007'
branch_labels = None
depends_on = None

def _u(col='user_id', **kw): return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True, **kw)
def _at(index=False): return sa.Column('at', sa.BigInteger(), nullable=False, index=index)

def upgrade() -> None:
    op.create_table('b8_emergency_cards', sa.Column('user_id', sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
                    sa.Column('blood', sa.String(4), nullable=False, server_default=''), sa.Column('allergies', sa.String(300), nullable=False, server_default=''),
                    sa.Column('meds', sa.String(300), nullable=False, server_default=''), sa.Column('notes', sa.String(500), nullable=False, server_default=''),
                    sa.Column('contacts', sa.JSON(), nullable=True), sa.Column('shared_with', sa.JSON(), nullable=True), _at(), sa.Column('updated_at', sa.BigInteger(), nullable=False))
    op.create_table('b8_reminders', sa.Column('id', sa.String(40), primary_key=True), _u('from_id'), _u('to_id'), sa.Column('note', sa.String(200), nullable=False),
                    sa.Column('due_at', sa.BigInteger(), nullable=False, index=True), sa.Column('status', sa.String(10), nullable=False, server_default='pending', index=True),
                    sa.Column('snoozes', sa.Integer(), nullable=False, server_default='0'), _at(True), sa.Column('sent_at', sa.BigInteger(), nullable=True))
    op.create_table('b8_meeting_notes', sa.Column('id', sa.String(40), primary_key=True), sa.Column('conv_id', sa.String(40), nullable=False, index=True), _u('created_by'),
                    sa.Column('title', sa.String(100), nullable=False), sa.Column('body', sa.Text(), nullable=False, server_default=''), sa.Column('items', sa.JSON(), nullable=True), _at(True))
    op.create_table('b8_jar_items', sa.Column('id', sa.String(40), primary_key=True), sa.Column('conv_id', sa.String(40), nullable=False, index=True),
                    sa.Column('msg_id', sa.String(40), nullable=False), _u('saved_by'), sa.Column('sender_id', sa.String(40), nullable=False, server_default=''),
                    sa.Column('text', sa.Text(), nullable=False, server_default=''), sa.Column('msg_at', sa.BigInteger(), nullable=False, server_default='0'), _at(True),
                    sa.UniqueConstraint('conv_id', 'msg_id', name='uq_b8_jar_conv_msg'))
    op.create_table('b8_kind_notes', sa.Column('id', sa.String(40), primary_key=True), _u('from_id'), _u('to_id'),
                    sa.Column('day', sa.String(10), nullable=False, index=True), sa.Column('text', sa.String(280), nullable=False), _at(True),
                    sa.UniqueConstraint('from_id', 'to_id', 'day', name='uq_b8_kind_day'))
    op.create_table('b8_away_notes', sa.Column('user_id', sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
                    sa.Column('text', sa.String(280), nullable=False), sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
                    sa.Column('start_min', sa.Integer(), nullable=False, server_default='1320'), sa.Column('end_min', sa.Integer(), nullable=False, server_default='420'),
                    sa.Column('tz_min', sa.Integer(), nullable=False, server_default='0'), _at(True))

def downgrade() -> None:
    for t in ('b8_away_notes', 'b8_kind_notes', 'b8_jar_items', 'b8_meeting_notes', 'b8_reminders', 'b8_emergency_cards'): op.drop_table(t)
