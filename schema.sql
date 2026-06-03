\restrict yXdXmgFJe0d0YdsJPLyNWMII405F2JB7kLDhufXlZ47TS5Yc2CZrkf2fIWeQD3r
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
CREATE TYPE public.appealstatus AS ENUM (
    'PENDING',
    'REVIEWED',
    'ACCEPTED',
    'REJECTED'
);


ALTER TYPE public.appealstatus OWNER TO postgres;

CREATE TYPE public.charactergender AS ENUM (
    'FEMALE',
    'MALE',
    'OTHER'
);


ALTER TYPE public.charactergender OWNER TO postgres;

CREATE TYPE public.characterrole AS ENUM (
    'PROTAGONIST',
    'ANTAGONIST',
    'MENTOR',
    'SECONDARY'
);


ALTER TYPE public.characterrole OWNER TO postgres;

CREATE TYPE public.characterstatus AS ENUM (
    'ALIVE',
    'DEAD',
    'MISSING',
    'UNKNOWN'
);


ALTER TYPE public.characterstatus OWNER TO postgres;

CREATE TYPE public.projectgenre AS ENUM (
    'NOVEL',
    'STORY',
    'NOVELLA',
    'POETRY',
    'DETECTIVE',
    'FANTASY',
    'SCI_FI',
    'ROMANCE',
    'THRILLER'
);


ALTER TYPE public.projectgenre OWNER TO postgres;

CREATE TYPE public.projectparts AS ENUM (
    'SINGLE',
    'MULTI'
);


ALTER TYPE public.projectparts OWNER TO postgres;

CREATE TYPE public.projectstatus AS ENUM (
    'IN_PROGRESS',
    'COMPLETED',
    'ON_PAUSE'
);


ALTER TYPE public.projectstatus OWNER TO postgres;

CREATE TYPE public.relationshiptype AS ENUM (
    'MARRIED',
    'COUPLE',
    'FRIENDS',
    'ENEMIES',
    'ACQUAINTANCES',
    'NEUTRAL'
);


ALTER TYPE public.relationshiptype OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.admin_logs (
    id integer NOT NULL,
    admin_id integer NOT NULL,
    admin_email character varying NOT NULL,
    admin_role character varying(20) NOT NULL,
    action character varying(50) NOT NULL,
    target_id integer,
    target_info json,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admin_logs OWNER TO postgres;

CREATE SEQUENCE public.admin_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.admin_logs_id_seq OWNER TO postgres;

ALTER SEQUENCE public.admin_logs_id_seq OWNED BY public.admin_logs.id;

CREATE TABLE public.chapters (
    id integer NOT NULL,
    project_id integer NOT NULL,
    title character varying(300) NOT NULL,
    content text DEFAULT ''::text,
    content_url character varying(500),
    char_count integer,
    "order" integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    user_deleted_at timestamp without time zone,
    is_generating boolean DEFAULT false
);


ALTER TABLE public.chapters OWNER TO postgres;

CREATE SEQUENCE public.chapters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.chapters_id_seq OWNER TO postgres;

ALTER SEQUENCE public.chapters_id_seq OWNED BY public.chapters.id;

CREATE TABLE public.character_chunks (
    id integer NOT NULL,
    character_id integer NOT NULL,
    project_id integer NOT NULL,
    appearance_text text NOT NULL,
    embedding text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.character_chunks OWNER TO postgres;

CREATE SEQUENCE public.character_chunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.character_chunks_id_seq OWNER TO postgres;

ALTER SEQUENCE public.character_chunks_id_seq OWNED BY public.character_chunks.id;

CREATE TABLE public.character_custom_labels (
    id integer NOT NULL,
    character_id integer NOT NULL,
    key character varying(100) NOT NULL,
    value character varying(500)
);


ALTER TABLE public.character_custom_labels OWNER TO postgres;

CREATE SEQUENCE public.character_custom_labels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.character_custom_labels_id_seq OWNER TO postgres;

ALTER SEQUENCE public.character_custom_labels_id_seq OWNED BY public.character_custom_labels.id;

CREATE TABLE public.character_relationships (
    id integer NOT NULL,
    project_id integer NOT NULL,
    char1_id integer NOT NULL,
    char2_id integer NOT NULL,
    relation_type public.relationshiptype NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.character_relationships OWNER TO postgres;

CREATE SEQUENCE public.character_relationships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.character_relationships_id_seq OWNER TO postgres;

ALTER SEQUENCE public.character_relationships_id_seq OWNED BY public.character_relationships.id;

CREATE TABLE public.characters (
    id integer NOT NULL,
    project_id integer NOT NULL,
    name character varying(150) NOT NULL,
    short_desc character varying(50),
    role public.characterrole,
    gender public.charactergender,
    gender_other character varying(100),
    birthdate character varying(10),
    age integer,
    char_status public.characterstatus,
    location character varying(200),
    features character varying(500),
    personality text,
    desc_full text,
    photo character varying(500),
    photo_full character varying(500),
    "order" integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


ALTER TABLE public.characters OWNER TO postgres;

CREATE SEQUENCE public.characters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.characters_id_seq OWNER TO postgres;

ALTER SEQUENCE public.characters_id_seq OWNED BY public.characters.id;

CREATE TABLE public.graph_layouts (
    id integer NOT NULL,
    project_id integer NOT NULL,
    nodes json NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE public.graph_layouts OWNER TO postgres;

CREATE SEQUENCE public.graph_layouts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.graph_layouts_id_seq OWNER TO postgres;

ALTER SEQUENCE public.graph_layouts_id_seq OWNED BY public.graph_layouts.id;

CREATE TABLE public.project_appeals (
    id integer NOT NULL,
    project_id integer NOT NULL,
    owner_id integer NOT NULL,
    owner_email character varying NOT NULL,
    project_title character varying(200) NOT NULL,
    message text NOT NULL,
    status public.appealstatus NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    reviewed_at timestamp with time zone,
    reviewed_by_id integer,
    owner_name character varying(255),
    admin_comment text
);


ALTER TABLE public.project_appeals OWNER TO postgres;

CREATE SEQUENCE public.project_appeals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.project_appeals_id_seq OWNER TO postgres;

ALTER SEQUENCE public.project_appeals_id_seq OWNED BY public.project_appeals.id;

CREATE TABLE public.projects (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    genre public.projectgenre,
    status public.projectstatus,
    parts public.projectparts,
    chapter_count integer,
    owner_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    is_deleted boolean DEFAULT false,
    deleted_reason text,
    deleted_at timestamp with time zone,
    deleted_by_id integer,
    deleted_by_email character varying,
    user_deleted_at timestamp without time zone,
    is_generating boolean DEFAULT false
);


ALTER TABLE public.projects OWNER TO postgres;

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.projects_id_seq OWNER TO postgres;

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;

CREATE TABLE public.text_chunks (
    id integer NOT NULL,
    chapter_id integer NOT NULL,
    project_id integer NOT NULL,
    chunk_index integer,
    text text NOT NULL,
    embedding text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.text_chunks OWNER TO postgres;

CREATE SEQUENCE public.text_chunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.text_chunks_id_seq OWNER TO postgres;

ALTER SEQUENCE public.text_chunks_id_seq OWNED BY public.text_chunks.id;

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying NOT NULL,
    hashed_password character varying NOT NULL,
    full_name character varying,
    is_active boolean,
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    token_version integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO postgres;

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

ALTER TABLE ONLY public.admin_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_logs_id_seq'::regclass);

ALTER TABLE ONLY public.chapters ALTER COLUMN id SET DEFAULT nextval('public.chapters_id_seq'::regclass);

ALTER TABLE ONLY public.character_chunks ALTER COLUMN id SET DEFAULT nextval('public.character_chunks_id_seq'::regclass);

ALTER TABLE ONLY public.character_custom_labels ALTER COLUMN id SET DEFAULT nextval('public.character_custom_labels_id_seq'::regclass);

ALTER TABLE ONLY public.character_relationships ALTER COLUMN id SET DEFAULT nextval('public.character_relationships_id_seq'::regclass);

ALTER TABLE ONLY public.characters ALTER COLUMN id SET DEFAULT nextval('public.characters_id_seq'::regclass);

ALTER TABLE ONLY public.graph_layouts ALTER COLUMN id SET DEFAULT nextval('public.graph_layouts_id_seq'::regclass);

ALTER TABLE ONLY public.project_appeals ALTER COLUMN id SET DEFAULT nextval('public.project_appeals_id_seq'::regclass);

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);

ALTER TABLE ONLY public.text_chunks ALTER COLUMN id SET DEFAULT nextval('public.text_chunks_id_seq'::regclass);

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.character_chunks
    ADD CONSTRAINT character_chunks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.character_custom_labels
    ADD CONSTRAINT character_custom_labels_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.graph_layouts
    ADD CONSTRAINT graph_layouts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.graph_layouts
    ADD CONSTRAINT graph_layouts_project_id_key UNIQUE (project_id);

ALTER TABLE ONLY public.project_appeals
    ADD CONSTRAINT project_appeals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.text_chunks
    ADD CONSTRAINT text_chunks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE INDEX ix_admin_logs_admin_id ON public.admin_logs USING btree (admin_id);

CREATE INDEX ix_admin_logs_id ON public.admin_logs USING btree (id);

CREATE INDEX ix_chapters_id ON public.chapters USING btree (id);

CREATE INDEX ix_character_chunks_character_id ON public.character_chunks USING btree (character_id);

CREATE INDEX ix_character_chunks_id ON public.character_chunks USING btree (id);

CREATE INDEX ix_character_chunks_project_id ON public.character_chunks USING btree (project_id);

CREATE INDEX ix_character_custom_labels_id ON public.character_custom_labels USING btree (id);

CREATE INDEX ix_character_relationships_id ON public.character_relationships USING btree (id);

CREATE INDEX ix_character_relationships_project_id ON public.character_relationships USING btree (project_id);

CREATE INDEX ix_characters_id ON public.characters USING btree (id);

CREATE INDEX ix_graph_layouts_id ON public.graph_layouts USING btree (id);

CREATE INDEX ix_project_appeals_id ON public.project_appeals USING btree (id);

CREATE INDEX ix_project_appeals_project_id ON public.project_appeals USING btree (project_id);

CREATE INDEX ix_projects_id ON public.projects USING btree (id);

CREATE INDEX ix_projects_owner_id ON public.projects USING btree (owner_id);

CREATE INDEX ix_text_chunks_chapter_id ON public.text_chunks USING btree (chapter_id);

CREATE INDEX ix_text_chunks_id ON public.text_chunks USING btree (id);

CREATE INDEX ix_text_chunks_project_id ON public.text_chunks USING btree (project_id);

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);

CREATE INDEX ix_users_id ON public.users USING btree (id);

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.character_chunks
    ADD CONSTRAINT character_chunks_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.character_chunks
    ADD CONSTRAINT character_chunks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.character_custom_labels
    ADD CONSTRAINT character_custom_labels_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_char1_id_fkey FOREIGN KEY (char1_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_char2_id_fkey FOREIGN KEY (char2_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.graph_layouts
    ADD CONSTRAINT graph_layouts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_appeals
    ADD CONSTRAINT project_appeals_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.text_chunks
    ADD CONSTRAINT text_chunks_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.text_chunks
    ADD CONSTRAINT text_chunks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
