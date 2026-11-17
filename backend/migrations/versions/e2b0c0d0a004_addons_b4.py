"""addons batch 4 (Glow): Photo Prompt Weekly, Mentor Match, Hidden Gems, Recipe Box, Book Nook, Meetup Board

Revision ID: e2b0c0d0a004
Revises: e2b0c0d0a003
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e2b0c0d0a004'
down_revision: Union[str, Sequence[str], None] = 'e2b0c0d0a003'
branch_labels = None
depends_on = None

def _u(col='user_id'): return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
def _fk(col, table): return sa.Column(col, sa.String(40), sa.ForeignKey(f'{table}.id', ondelete='CASCADE'), nullable=False, index=True)
def _id(): return sa.Column('id', sa.String(40), primary_key=True)
def _at(index=False): return sa.Column('at', sa.BigInteger(), nullable=False, index=index)

def upgrade() -> None:
    op.create_table('b4_photo_themes', sa.Column('week', sa.String(8), primary_key=True), sa.Column('title', sa.String(80), nullable=False),
                    sa.Column('hint', sa.String(200), nullable=False, server_default=''), sa.Column('set_by', sa.String(60), nullable=False, server_default=''), _at())
    op.create_table('b4_photo_entries', _id(), sa.Column('week', sa.String(8), nullable=False, index=True), _u(),
                    sa.Column('media_url', sa.String(200), nullable=False), sa.Column('caption', sa.String(140), nullable=False, server_default=''), _at(True),
                    sa.UniqueConstraint('week', 'user_id', name='uq_b4_photo_entry_week_user'))
    op.create_table('b4_photo_votes', _id(), _fk('entry_id', 'b4_photo_entries'), _u(), sa.Column('week', sa.String(8), nullable=False, index=True), _at(),
                    sa.UniqueConstraint('entry_id', 'user_id', name='uq_b4_photo_vote'))
    op.create_table('b4_mentor_profiles', _id(), _u(), sa.Column('role', sa.String(10), nullable=False), sa.Column('topic', sa.String(40), nullable=False, index=True),
                    sa.Column('bio', sa.String(280), nullable=False, server_default=''), _at(True),
                    sa.UniqueConstraint('user_id', 'role', 'topic', name='uq_b4_mentor_profile'))
    op.create_table('b4_mentorships', _id(), _u('mentor_id'), _u('mentee_id'), sa.Column('topic', sa.String(40), nullable=False),
                    sa.Column('note', sa.String(280), nullable=False, server_default=''), sa.Column('status', sa.String(10), nullable=False, server_default='pending', index=True),
                    _at(True), sa.Column('decided_at', sa.BigInteger(), nullable=True))
    op.create_table('b4_mentor_notes', _id(), _fk('mentorship_id', 'b4_mentorships'), _u(), sa.Column('text', sa.Text(), nullable=False), _at())
    op.create_table('b4_gems', _id(), _u(), sa.Column('name', sa.String(80), nullable=False), sa.Column('area', sa.String(60), nullable=False, index=True),
                    sa.Column('category', sa.String(20), nullable=False, index=True), sa.Column('why', sa.String(400), nullable=False),
                    sa.Column('upvotes', sa.JSON(), nullable=False, server_default='[]'), _at(True))
    op.create_table('b4_recipes', _id(), _u(), sa.Column('title', sa.String(80), nullable=False), sa.Column('ingredients', sa.JSON(), nullable=False, server_default='[]'),
                    sa.Column('steps', sa.JSON(), nullable=False, server_default='[]'), sa.Column('minutes', sa.Integer(), nullable=False), sa.Column('servings', sa.Integer(), nullable=False), _at(True))
    op.create_table('b4_recipe_saves', sa.Column('recipe_id', sa.String(40), sa.ForeignKey('b4_recipes.id', ondelete='CASCADE'), primary_key=True),
                    sa.Column('user_id', sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, index=True), _at())
    op.create_table('b4_recipe_cooks', _id(), _fk('recipe_id', 'b4_recipes'), _u(), _at())
    op.create_table('b4_books', _id(), _u(), sa.Column('title', sa.String(120), nullable=False), sa.Column('author', sa.String(80), nullable=False, server_default=''),
                    sa.Column('status', sa.String(10), nullable=False, server_default='want'), sa.Column('rating', sa.Integer(), nullable=True),
                    sa.Column('review', sa.String(500), nullable=False, server_default=''), _at(True), sa.Column('updated_at', sa.BigInteger(), nullable=False, index=True))
    op.create_table('b4_meetups', _id(), _u('host_id'), sa.Column('title', sa.String(80), nullable=False), sa.Column('place', sa.String(120), nullable=False),
                    sa.Column('starts_at', sa.BigInteger(), nullable=False, index=True), sa.Column('capacity', sa.Integer(), nullable=False),
                    sa.Column('note', sa.String(400), nullable=False, server_default=''), sa.Column('status', sa.String(10), nullable=False, server_default='open', index=True), _at(True))
    op.create_table('b4_rsvps', _id(), _fk('meetup_id', 'b4_meetups'), _u(), sa.Column('status', sa.String(10), nullable=False), _at(),
                    sa.UniqueConstraint('meetup_id', 'user_id', name='uq_b4_rsvp'))

def downgrade() -> None:
    for t in ('b4_rsvps', 'b4_meetups', 'b4_books', 'b4_recipe_cooks', 'b4_recipe_saves', 'b4_recipes', 'b4_gems',
              'b4_mentor_notes', 'b4_mentorships', 'b4_mentor_profiles', 'b4_photo_votes', 'b4_photo_entries', 'b4_photo_themes'):
        op.drop_table(t)
