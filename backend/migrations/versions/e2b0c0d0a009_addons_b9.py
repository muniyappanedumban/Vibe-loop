"""addons batch 9 (Hush): Confession Box, Time Zone Board, Read-Later Shelf, Study Sprint, Shared Budget, Vote to Pin

Revision ID: e2b0c0d0a009
Revises: e2b0c0d0a008
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2b0c0d0a009'
down_revision: Union[str, Sequence[str], None] = 'e2b0c0d0a008'
branch_labels = None
depends_on = None

def _id(): return sa.Column('id', sa.String(40), primary_key=True)
def _u(col='user_id'): return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
def _conv(): return sa.Column('conv_id', sa.String(40), nullable=False, index=True)
def _at(index=False): return sa.Column('at', sa.BigInteger(), nullable=False, index=index)

def upgrade() -> None:
    op.create_table('b9_confession_boxes', _id(), _conv(), _u('created_by'), sa.Column('title', sa.String(80), nullable=False),
                    sa.Column('open', sa.Boolean(), nullable=False, server_default=sa.true()), _at())
    op.create_table('b9_confessions', _id(), sa.Column('box_id', sa.String(40), sa.ForeignKey('b9_confession_boxes.id', ondelete='CASCADE'), nullable=False, index=True),
                    _u(), sa.Column('text', sa.String(500), nullable=False), sa.Column('reactions', sa.JSON(), nullable=True), _at(True))
    op.create_table('b9_tz_entries', _id(), _conv(), _u(), sa.Column('city', sa.String(60), nullable=False), sa.Column('offset_min', sa.Integer(), nullable=False),
                    sa.Column('wake', sa.Integer(), nullable=False, server_default='9'), sa.Column('sleep', sa.Integer(), nullable=False, server_default='22'), _at(),
                    sa.UniqueConstraint('conv_id', 'user_id', name='uq_b9_tz_conv_user'))
    op.create_table('b9_shelf_items', _id(), _conv(), _u(), sa.Column('url', sa.String(500), nullable=False), sa.Column('title', sa.String(120), nullable=False),
                    sa.Column('note', sa.String(280), nullable=False, server_default=''), sa.Column('read_by', sa.JSON(), nullable=True), _at())
    op.create_table('b9_sprints', _id(), _conv(), _u('created_by'), sa.Column('goal', sa.String(120), nullable=False, server_default=''),
                    sa.Column('minutes', sa.Integer(), nullable=False), sa.Column('ends_at', sa.BigInteger(), nullable=False, index=True),
                    sa.Column('members', sa.JSON(), nullable=True), sa.Column('quit', sa.JSON(), nullable=True),
                    sa.Column('status', sa.String(10), nullable=False, server_default='running'), _at())
    op.create_table('b9_budgets', _id(), _conv(), _u('created_by'), sa.Column('title', sa.String(80), nullable=False),
                    sa.Column('currency', sa.String(3), nullable=False, server_default='INR'), sa.Column('categories', sa.JSON(), nullable=True), _at())
    op.create_table('b9_budget_spends', _id(), sa.Column('budget_id', sa.String(40), sa.ForeignKey('b9_budgets.id', ondelete='CASCADE'), nullable=False, index=True),
                    _u(), sa.Column('category', sa.String(40), nullable=False), sa.Column('amount', sa.Integer(), nullable=False),
                    sa.Column('note', sa.String(120), nullable=False, server_default=''), _at())
    op.create_table('b9_pin_proposals', _id(), _conv(), _u(), sa.Column('text', sa.String(300), nullable=False), sa.Column('yes', sa.JSON(), nullable=True),
                    sa.Column('status', sa.String(10), nullable=False, server_default='open', index=True), sa.Column('pinned_at', sa.BigInteger(), nullable=True), _at())

def downgrade() -> None:
    for t in ('b9_pin_proposals', 'b9_budget_spends', 'b9_budgets', 'b9_sprints', 'b9_shelf_items', 'b9_tz_entries', 'b9_confessions', 'b9_confession_boxes'):
        op.drop_table(t)
