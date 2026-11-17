"""addons batch 3 (Glow): Local Pulse, Skill Swap Board, Ask Box, Memory Lane, Goal Ladder, Wish Shelf

Revision ID: e2b0c0d0a003
Revises: e2b0c0d0a002
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2b0c0d0a003'
down_revision: Union[str, Sequence[str], None] = 'e2b0c0d0a002'
branch_labels = None
depends_on = None

def _u(col='user_id'): return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
def _id(): return sa.Column('id', sa.String(40), primary_key=True)
def _at(): return sa.Column('at', sa.BigInteger(), nullable=False, index=True)

def upgrade() -> None:
    op.create_table('b3_pulse', _id(), _u(), sa.Column('area', sa.String(60), nullable=False), sa.Column('area_key', sa.String(60), nullable=False, index=True),
                    sa.Column('text', sa.String(280), nullable=False), sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()),
                    sa.Column('reports', sa.Integer(), nullable=False, server_default='0'), sa.Column('expires_at', sa.BigInteger(), nullable=False, index=True), _at())
    op.create_table('b3_pulse_reports', _id(), sa.Column('pulse_id', sa.String(40), sa.ForeignKey('b3_pulse.id', ondelete='CASCADE'), nullable=False, index=True), _u(),
                    sa.Column('reason', sa.String(120), nullable=False), sa.Column('status', sa.String(12), nullable=False, server_default='open'),
                    sa.Column('at', sa.BigInteger(), nullable=False), sa.UniqueConstraint('pulse_id', 'user_id', name='uq_b3_pulse_report'))
    op.create_table('b3_skills', _id(), _u(), sa.Column('teach', sa.String(60), nullable=False), sa.Column('learn', sa.String(60), nullable=False),
                    sa.Column('note', sa.String(200), nullable=False, server_default=''), sa.Column('open', sa.Boolean(), nullable=False, server_default=sa.true()), _at())
    op.create_table('b3_swaps', _id(), sa.Column('listing_id', sa.String(40), sa.ForeignKey('b3_skills.id', ondelete='CASCADE'), nullable=False, index=True),
                    _u('from_id'), _u('to_id'), sa.Column('message', sa.String(200), nullable=False, server_default=''),
                    sa.Column('status', sa.String(12), nullable=False, server_default='pending'), _at())
    op.create_table('b3_questions', _id(), _u('owner_id'), _u('asker_id'), sa.Column('anon', sa.Boolean(), nullable=False, server_default=sa.false()),
                    sa.Column('text', sa.String(300), nullable=False), sa.Column('answer', sa.Text(), nullable=True),
                    sa.Column('answered_at', sa.BigInteger(), nullable=True), _at())
    op.create_table('b3_memories', _id(), _u(), sa.Column('post_id', sa.String(40), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False, index=True),
                    sa.Column('note', sa.String(200), nullable=False, server_default=''), sa.Column('at', sa.BigInteger(), nullable=False),
                    sa.UniqueConstraint('user_id', 'post_id', name='uq_b3_memory'))
    op.create_table('b3_goals', _id(), _u(), sa.Column('title', sa.String(100), nullable=False), sa.Column('why', sa.String(200), nullable=False, server_default=''),
                    sa.Column('steps', sa.JSON(), nullable=True), sa.Column('cheers', sa.JSON(), nullable=True), sa.Column('done_at', sa.BigInteger(), nullable=True), _at())
    op.create_table('b3_wishes', _id(), _u('owner_id'), sa.Column('title', sa.String(100), nullable=False), sa.Column('link', sa.String(300), nullable=True),
                    sa.Column('note', sa.String(200), nullable=False, server_default=''), _at())
    op.create_table('b3_wish_claims', sa.Column('wish_id', sa.String(40), sa.ForeignKey('b3_wishes.id', ondelete='CASCADE'), primary_key=True), _u(),
                    sa.Column('at', sa.BigInteger(), nullable=False))

def downgrade() -> None:
    for t in ('b3_wish_claims', 'b3_wishes', 'b3_goals', 'b3_memories', 'b3_questions', 'b3_swaps', 'b3_skills', 'b3_pulse_reports', 'b3_pulse'):
        op.drop_table(t)
