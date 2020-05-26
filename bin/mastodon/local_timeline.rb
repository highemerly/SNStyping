require_relative '../../src/mastodon.rb'

Mastodon.new(ARGV, File.basename(__FILE__)).run