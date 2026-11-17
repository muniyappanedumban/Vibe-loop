"""addons batch 7 (Hush): Chore Rotation, Watch Queue, Secret Santa, Lend Log, Habit Buddies, Trip Planner

Revision ID: e2b0c0d0a007
Revises: e2b0c0d0a006
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2b0c0d0a007'
down_revision: Union[str, Sequence[str], None] = 'e2b0c0d0a006'
branch_labels = None
depends_on = None

def _u(col): return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
def _id(): return sa.Column('id', sa.String(40), primary_key=True)
def _conv(): return sa.Column('conv_id', sa.String(40), nullable=False, index=True)
def _at(): return sa.Column('at', sa.BigInteger(), nullable=False)

def upgrade() -> None:
    op.create_table('b7_chores', _id(), _conv(), _u('created_by'), sa.Column('title', sa.String(80), nullable=False), sa.Column('rota', sa.JSON(), nullable=False),
                    sa.Column('turn', sa.Integer(), nullable=False), sa.Column('every_days', sa.Integer(), nullable=False), sa.Column('due_at', sa.BigInteger(), nullable=False),
                    sa.Column('last_by', sa.String(40), nullable=True), sa.Column('last_at', sa.BigInteger(), nullable=True), _at())
    op.create_table('b7_watch_items', _id(), _conv(), _u('added_by'), sa.Column('title', sa.String(120), nullable=False), sa.Column('kind', sa.String(10), nullable=False),
                    sa.Column('votes', sa.JSON(), nullable=False), sa.Column('ratings', sa.JSON(), nullable=False), sa.Column('watched', sa.Boolean(), nullable=False), _at())
    op.create_table('b7_santas', _id(), _conv(), _u('organiser_id'), sa.Column('title', sa.String(80), nullable=False), sa.Column('budget', sa.String(40), nullable=False),
                    sa.Column('status', sa.String(10), nullable=False), sa.Column('joined', sa.JSON(), nullable=False), sa.Column('pairs', sa.JSON(), nullable=False), _at())
    op.create_table('b7_lends', _id(), _conv(), _u('lender_id'), _u('borrower_id'), sa.Column('item', sa.String(120), nullable=False),
                    sa.Column('due_at', sa.BigInteger(), nullable=True), sa.Column('returned', sa.Boolean(), nullable=False), sa.Column('returned_at', sa.BigInteger(), nullable=True),
                    sa.Column('reminded_at', sa.BigInteger(), nullable=True), _at())
    op.create_table('b7_habits', _id(), sa.Column('title', sa.String(80), nullable=False), _u('owner_id'), _u('buddy_id'), sa.Column('status', sa.String(10), nullable=False), _at())
    op.create_table('b7_habit_checks', _id(), sa.Column('habit_id', sa.String(40), sa.ForeignKey('b7_habits.id', ondelete='CASCADE'), nullable=False, index=True),
                    _u('user_id'), sa.Column('day', sa.String(10), nullable=False), _at(), sa.UniqueConstraint('habit_id', 'user_id', 'day', name='uq_b7_habit_check'))
    op.create_table('b7_trips', _id(), _conv(), _u('created_by'), sa.Column('title', sa.String(80), nullable=False), sa.Column('days', sa.JSON(), nullable=False), _at())

def downgrade() -> None:
    for t in ('b7_trips', 'b7_habit_checks', 'b7_habits', 'b7_lends', 'b7_santas', 'b7_watch_items', 'b7_chores'): op.drop_table(t)
