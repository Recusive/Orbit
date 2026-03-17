extension OrbitTerminal {
    /// Possible errors from internal OrbitTerminal calls.
    enum Error: Swift.Error, CustomLocalizedStringResourceConvertible {
        case apiFailed

        var localizedStringResource: LocalizedStringResource {
            switch self {
            case .apiFailed: return "libghostty API call failed"
            }
        }
    }
}
