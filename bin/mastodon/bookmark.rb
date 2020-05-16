require_relative '../../mastodon.rb'

Mastodon.new(ARGV, File.basename(__FILE__)).run