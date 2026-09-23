import { createClient } from '@supabase/supabase-js'

// You get these values from your Supabase Project Settings > API
const supabaseUrl = 'https://hsblyigqmncuydpnsext.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzYmx5aWdxbW5jdXlkcG5zZXh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNzYyOTIsImV4cCI6MjA5MDg1MjI5Mn0.b2uI4GDc9UvjXgMM-Sfl7oZJi-ykxw_R2pOngx3s0hc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)