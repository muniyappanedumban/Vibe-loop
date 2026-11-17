"""addons batch 6 (Hush): Check-in Circle, Plan Board, Birthday Buddy, Ride Rota, Decision Dice, Gift Pool

Revision ID: e2b0c0d0a006
Revises: e2b0c0d0a005
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2b0c0d0a006'
down_revision: Union[str, Sequence[str], None] = 'e2b0c0d0a005'
branch_labels = None
depends_on = None

def _id(): return sa.Column('id', sa.String(40), primary_key=True)
def _cv(): return sa.Column('conv_id', sa.String(40), nullable=False, index=True)
def _u(col='user_id'): return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
def _at(): return sa.Column('at', sa.BigInteger(), nullable=False)

def upgrade() -> None:
    op.create_table('b6_checkins', _id(), _cv(), _u(), sa.Column('day', sa.String(10), nullable=False, index=True), sa.Column('mood', sa.Integer(), nullable=False),
                    sa.Column('note', sa.String(140), nullable=False, server_default=''), _at(),
                    sa.UniqueConstraint('conv_id', 'user_id', 'day', name='uq_b6_checkin_day'))
    op.create_table('b6_plans', _id(), _cv(), _u('created_by'), sa.Column('title', sa.String(80), nullable=False),
                    sa.Column('place', sa.String(120), nullable=False, server_default=''), sa.Column('starts_at', sa.BigInteger(), nullable=False, index=True),
                    sa.Column('rsvps', sa.JSON(), nullable=True), _at())
    op.create_table('b6_birthdays', _id(), _cv(), _u(), sa.Column('month', sa.Integer(), nullable=False), sa.Column('day', sa.Integer(), nullable=False),
                    sa.Column('reminded', sa.String(10), nullable=False, server_default=''), _at(),
                    sa.UniqueConstraint('conv_id', 'user_id', name='uq_b6_birthday_member'))
    op.create_table('b6_rides', _id(), _cv(), _u('driver_id'), sa.Column('dest', sa.String(120), nullable=False), sa.Column('leaves_at', sa.BigInteger(), nullable=False),
                    sa.Column('seats', sa.Integer(), nullable=False), sa.Column('riders', sa.JSON(), nullable=True),
                    sa.Column('closed', sa.Boolean(), nullable=False, server_default=sa.false()), _at())
    op.create_table('b6_dice', _id(), _cv(), _u('created_by'), sa.Column('question', sa.String(120), nullable=False), sa.Column('options', sa.JSON(), nullable=True),
                    sa.Column('votes', sa.JSON(), nullable=True), sa.Column('result', sa.Integer(), nullable=True), sa.Column('method', sa.String(10), nullable=False, server_default=''),
                    sa.Column('settled_at', sa.BigInteger(), nullable=True), _at())
    op.create_table('b6_gifts', _id(), _cv(), _u('organiser_id'), sa.Column('for_name', sa.String(80), nullable=False),
                    sa.Column('idea', sa.String(140), nullable=False, server_default=''), sa.Column('target', sa.Integer(), nullable=False),
                    sa.Column('currency', sa.String(3), nullable=False, server_default='INR'), sa.Column('pledges', sa.JSON(), nullable=True),
                    sa.Column('purchased', sa.Boolean(), nullable=False, server_default=sa.false()), _at())

def downgrade() -> None:
    for t in ('b6_gifts', 'b6_dice', 'b6_rides', 'b6_birthdays', 'b6_plans', 'b6_checkins'): op.drop_table(t)
